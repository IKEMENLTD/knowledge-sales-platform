import {
  type DedupeCandidateInput,
  type DedupeQueryInput,
  rankCandidates,
} from '@/lib/api/contacts-dedupe';
import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import {
  type DuplicateCandidate,
  type DuplicateListResponse,
  duplicateListResponseSchema,
} from '@ksp/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/contacts/[id]/duplicates
 *
 * 指定 contact (= 新規取り込み側) と「同じ人物っぽい」既存 contact をスコアリングして返す。
 *
 * 候補抽出:
 *   - normalized_email 一致
 *   - normalized_phone 一致
 *   - business_card_image_hash 一致
 *   - 同 company_id + 名前一致 (NFKC + lower)
 *   - linkedin_url 一致 (lower-cased)
 *
 * 抽出は OR 条件で SQL に投げ、スコアリングは TypeScript 側で行う (純関数 → unit test 済)。
 * 自身 (= new contact_id) は除外。deleted_at が NULL の row のみ対象。
 *
 * Idempotency-Key 不要 (GET なので defineRoute も付けない)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ContactQueryRow {
  id: string;
  name: string | null;
  company_id: string | null;
  normalized_email: string | null;
  normalized_phone: string | null;
  business_card_image_hash: string | null;
  linkedin_url: string | null;
  captured_at: string | null;
  /**
   * Supabase JS は nested relationship を array で返すため (`select('...,companies(name)')`)、
   * 1件参照でも `{ name }[]` として typing する。読み出しは [0] で行う。
   */
  companies?: Array<{ name: string | null }> | { name: string | null } | null;
  email?: string | null;
}

export async function GET(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'contact id must be uuid');
  }
  const newContactId = idParse.data.id;

  const handler = defineRoute({}, async ({ supabase }) => {
    // 1) 起点 contact を取得。
    const { data: meRow, error: meError } = await supabase
      .from('contacts')
      .select(
        'id,name,company_id,normalized_email,normalized_phone,business_card_image_hash,linkedin_url',
      )
      .eq('id', newContactId)
      .is('deleted_at', null)
      .maybeSingle();
    if (meError) {
      return errorResponse(500, 'contact_lookup_failed', meError.message);
    }
    const me = meRow as ContactQueryRow | null;
    if (!me) {
      return errorResponse(404, 'contact_not_found');
    }

    const query: DedupeQueryInput = {
      name: me.name,
      companyId: me.company_id,
      normalizedEmail: me.normalized_email,
      normalizedPhone: me.normalized_phone,
      businessCardImageHash: me.business_card_image_hash,
      linkedinUrl: me.linkedin_url,
    };

    // 2) OR 候補抽出。Supabase JS の or() 文字列を組み立て。
    const orClauses: string[] = [];
    if (query.normalizedEmail)
      orClauses.push(`normalized_email.eq.${escapeOr(query.normalizedEmail)}`);
    if (query.normalizedPhone)
      orClauses.push(`normalized_phone.eq.${escapeOr(query.normalizedPhone)}`);
    if (query.businessCardImageHash)
      orClauses.push(`business_card_image_hash.eq.${escapeOr(query.businessCardImageHash)}`);
    if (query.linkedinUrl) orClauses.push(`linkedin_url.eq.${escapeOr(query.linkedinUrl)}`);
    if (query.companyId) orClauses.push(`company_id.eq.${escapeOr(query.companyId)}`);

    if (orClauses.length === 0) {
      const response: DuplicateListResponse = { newContactId, candidates: [] };
      return ok(duplicateListResponseSchema.parse(response));
    }

    const { data: rows, error: queryError } = await supabase
      .from('contacts')
      .select(
        'id,name,email,company_id,normalized_email,normalized_phone,business_card_image_hash,linkedin_url,captured_at,companies(name)',
      )
      .neq('id', newContactId)
      .is('deleted_at', null)
      .or(orClauses.join(','))
      .limit(50);

    if (queryError) {
      return errorResponse(500, 'duplicate_lookup_failed', queryError.message);
    }

    const candidateInputs: DedupeCandidateInput[] = (rows ?? []).map((r) => {
      const row = r as ContactQueryRow;
      return {
        contactId: row.id,
        name: row.name,
        companyId: row.company_id,
        normalizedEmail: row.normalized_email,
        normalizedPhone: row.normalized_phone,
        businessCardImageHash: row.business_card_image_hash,
        linkedinUrl: row.linkedin_url,
      };
    });

    const ranked = rankCandidates(query, candidateInputs);

    // 3) スコア順を Response shape に整形。row metadata も同梱。
    const byId = new Map<string, ContactQueryRow>();
    for (const r of rows ?? []) {
      const row = r as ContactQueryRow;
      byId.set(row.id, row);
    }

    const candidates: DuplicateCandidate[] = ranked.map((m) => {
      const row = byId.get(m.contactId);
      const companyName = Array.isArray(row?.companies)
        ? (row?.companies[0]?.name ?? null)
        : (row?.companies?.name ?? null);
      return {
        contactId: m.contactId,
        name: row?.name ?? '',
        companyName,
        email: row?.email ?? null,
        matchScore: m.matchScore,
        matchFields: m.matchFields,
        capturedAt: row?.captured_at ?? null,
      };
    });

    const response: DuplicateListResponse = { newContactId, candidates };
    const parsed = duplicateListResponseSchema.safeParse(response);
    if (!parsed.success) {
      return errorResponse(500, 'response_shape_mismatch', undefined, parsed.error.flatten());
    }
    return ok(parsed.data);
  });

  return handler(req);
}

/** Supabase JS の or() 文字列内で使えないメタ文字を簡易エスケープ。 */
function escapeOr(value: string): string {
  return value.replace(/,/g, '\\,').replace(/\)/g, '\\)');
}
