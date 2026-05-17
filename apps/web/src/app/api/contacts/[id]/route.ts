import { normalizeEmail, normalizePhone } from '@/lib/api/contacts-dedupe';
import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { contactUpdateRequestSchema } from '@ksp/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * PATCH /api/contacts/[id]
 *
 * 名刺レビュー画面の保存ハンドラ。
 *
 * 認可:
 *   - 自分が owner_user_id の row のみ更新可能 (RLS 0034 でも担保)。
 *   - manager / admin は他人の row も更新可能 (RLS 側で role 判定済)。
 *   - 二重チェックとして、UPDATE 前に owner_user_id を引いて role と突き合わせる。
 *
 * 副作用:
 *   - companyName 指定時は companies に upsert (name で同名検索 → 無ければ INSERT)。
 *     domain は推測しないため空のまま (= 後で会社ページから補完)。
 *   - email / phone が更新された場合は normalized_email / normalized_phone も更新。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.object({ id: z.string().uuid() });

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CompanyRow {
  id: string;
}
interface ContactOwnerRow {
  id: string;
  owner_user_id: string;
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  const resolved = await ctx.params;
  const idParse = idParamSchema.safeParse(resolved);
  if (!idParse.success) {
    return errorResponse(400, 'invalid_id', 'contact id must be uuid');
  }
  const contactId = idParse.data.id;

  const handler = defineRoute(
    { body: contactUpdateRequestSchema },
    async ({ user, supabase, body }) => {
      // 1) owner / role の二重チェック。
      const { data: existing, error: ownerError } = await supabase
        .from('contacts')
        .select('id,owner_user_id')
        .eq('id', contactId)
        .is('deleted_at', null)
        .maybeSingle();
      if (ownerError) {
        return errorResponse(500, 'contact_lookup_failed', ownerError.message);
      }
      const owner = existing as ContactOwnerRow | null;
      if (!owner) {
        return errorResponse(404, 'contact_not_found');
      }
      const isPrivileged = user.role === 'manager' || user.role === 'admin';
      if (!isPrivileged && owner.owner_user_id !== user.id) {
        return errorResponse(403, 'forbidden', 'not contact owner');
      }

      // 2) company 解決 (companyName 指定時は upsert)。
      let resolvedCompanyId: string | null | undefined = body.companyId;
      if (resolvedCompanyId === undefined && body.companyName) {
        const trimmed = body.companyName.trim();
        // 既存検索 (同 org_id 配下、name 完全一致)。
        const { data: found } = await supabase
          .from('companies')
          .select('id')
          .eq('name', trimmed)
          .limit(1)
          .maybeSingle();
        const foundRow = found as CompanyRow | null;
        if (foundRow?.id) {
          resolvedCompanyId = foundRow.id;
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from('companies')
            .insert({ name: trimmed })
            .select('id')
            .single();
          if (insertErr || !inserted) {
            return errorResponse(500, 'company_insert_failed', insertErr?.message ?? 'unknown');
          }
          resolvedCompanyId = (inserted as CompanyRow).id;
        }
      }

      // 3) UPDATE payload を組み立て。undefined は触らない、null は明示 NULL。
      const update: Record<string, unknown> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.nameKana !== undefined) update.name_kana = body.nameKana;
      if (body.title !== undefined) update.title = body.title;
      if (body.email !== undefined) {
        update.email = body.email;
        update.normalized_email = normalizeEmail(body.email);
      }
      if (body.phone !== undefined) {
        update.phone = body.phone;
        update.normalized_phone = normalizePhone(body.phone);
      }
      if (resolvedCompanyId !== undefined) update.company_id = resolvedCompanyId;
      if (body.linkedinUrl !== undefined) update.linkedin_url = body.linkedinUrl;
      if (body.tags !== undefined) update.tags = body.tags;
      if (body.reviewStatus !== undefined) update.review_status = body.reviewStatus;
      if (body.status !== undefined) update.status = body.status;
      update.updated_at = new Date().toISOString();

      if (Object.keys(update).length === 1) {
        // updated_at だけ = 実質変更なし
        return ok({ contactId, updated: false });
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update(update)
        .eq('id', contactId);

      if (updateError) {
        return errorResponse(500, 'contact_update_failed', updateError.message);
      }

      return ok({ contactId, updated: true });
    },
  );

  return handler(req);
}
