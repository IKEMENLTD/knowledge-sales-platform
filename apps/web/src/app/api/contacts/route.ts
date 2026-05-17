import { pgmqSendWeb } from '@/lib/api/pgmq';
import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import {
  type ContactRegisterResponse,
  contactRegisterRequestSchema,
  contactRegisterResponseSchema,
} from '@ksp/shared';

/**
 * POST /api/contacts
 *
 * クライアント側で Supabase Storage への PUT が成功したあとに呼ばれる「登録確定」API。
 *  1) contacts に row INSERT (review_status='pending_ocr')
 *  2) pgmq `process_business_card` に enqueue
 *  3) 既存同 hash があれば既存 contactId を返し、新規 INSERT/enqueue を skip
 *
 * 設計:
 *   - INSERT は anon client (cookie) で実行 → RLS で owner_user_id=auth.uid() の
 *     INSERT のみ許可される (0003 / 0012 / 0034 想定)。
 *   - pgmq.send は service_role 必須なので pgmqSendWeb 経由。
 *   - name は OCR 完了までのプレースホルダ "読み取り中…" を入れる。後段 worker が上書き。
 *   - rate limit: 既定 60/min。upload-url 側で 30/min に絞っているので register は緩め。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ContactRow {
  id: string;
}

export const POST = defineRoute(
  { body: contactRegisterRequestSchema },
  async ({ user, supabase, body }) => {
    // 1) 既存 hash があれば再利用 (OCR 二重起動を防ぐ)。
    //    Round 4 P1 CTO MID: dedup を user.orgId スコープに限定 (Phase2 マルチテナント整合)
    let existingId: string | null = null;
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('business_card_image_hash', body.contentSha256)
        .eq('org_id', user.orgId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      const row = data as ContactRow | null;
      if (row?.id) existingId = row.id;
    } catch {
      // migration 未適用環境では fall through。
    }

    if (existingId) {
      const response: ContactRegisterResponse = {
        contactId: existingId,
        enqueuedForOcr: false,
        duplicateOf: existingId,
      };
      const parsed = contactRegisterResponseSchema.safeParse(response);
      if (!parsed.success) {
        return errorResponse(500, 'response_shape_mismatch');
      }
      return ok(parsed.data);
    }

    // 2) contacts INSERT。
    //    Round 4 P1 CTO MID: org_id を user.orgId に明示。default 削除後 (Phase2) でも安全。
    const insertPayload: Record<string, unknown> = {
      owner_user_id: user.id,
      created_by_user_id: user.id,
      org_id: user.orgId,
      name: '読み取り中…',
      business_card_image_url: body.storageKey,
      business_card_image_hash: body.contentSha256,
      review_status: 'pending_ocr',
      source: 'business_card',
      status: 'new',
    };
    if (body.capturedAt) {
      insertPayload.captured_at = body.capturedAt;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('contacts')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError || !inserted) {
      return errorResponse(500, 'contact_insert_failed', insertError?.message ?? 'unknown_error');
    }

    const contactId = (inserted as ContactRow).id;

    // 3) pgmq enqueue (service_role)。
    let enqueuedForOcr = true;
    try {
      const { msgId } = await pgmqSendWeb('process_business_card', {
        contactId,
        imageStorageKey: body.storageKey,
        uploadedBy: user.id,
      });
      if (msgId === null) {
        // RPC 不在等で送れなかったケース。row は残すが OCR は手動再投入が必要。
        enqueuedForOcr = false;
      }
    } catch (err) {
      // enqueue 失敗時は contact を pending_ocr のまま残すしか無い (row 削除しない)。
      // 後段の retry コマンドで再 enqueue できる設計を想定。
      return errorResponse(
        502,
        'enqueue_failed',
        `OCR queue unavailable: ${(err as Error).message}`,
        { contactId },
      );
    }

    const response: ContactRegisterResponse = {
      contactId,
      enqueuedForOcr,
      duplicateOf: null,
    };
    const parsed = contactRegisterResponseSchema.safeParse(response);
    if (!parsed.success) {
      return errorResponse(500, 'response_shape_mismatch');
    }
    return ok(parsed.data);
  },
);
