import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { z } from 'zod';

/**
 * POST /api/share-links/revoke — 共有リンク失効 (SC-46) のフォールバック経路。
 *
 * `[code]/route.ts` の DELETE が本命だが、UUID を URL に乗せず body 経由で
 * 失効させたい (URL ログに残したくない) ケース、または Next.js の動的セグメント
 * 制約で `[id]` 用 DELETE が使えない環境向けの互換 endpoint。
 *  - body: { id: uuid }
 *  - revoked_at に now() を書く論理失効。
 *  - 削除権限は RLS (0022 share_links_*_owner) に委譲。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ id: z.string().uuid() });

interface ShareLinkRevokeRow {
  id: string;
  revoked_at: string | null;
}

export const POST = defineRoute(
  { body: bodySchema },
  async ({ supabase, body }) => {
    const { data: existingRaw, error: lookupErr } = await supabase
      .from('share_links')
      .select('id,revoked_at')
      .eq('id', body.id)
      .maybeSingle();
    if (lookupErr) {
      return errorResponse(500, 'share_link_lookup_failed', lookupErr.message);
    }
    const existing = existingRaw as ShareLinkRevokeRow | null;
    if (!existing) {
      return errorResponse(404, 'share_link_not_found');
    }
    if (existing.revoked_at) {
      return ok({ id: body.id, revoked: true, alreadyRevoked: true });
    }
    const { error: updateErr } = await supabase
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', body.id);
    if (updateErr) {
      return errorResponse(500, 'share_link_revoke_failed', updateErr.message);
    }
    return ok({ id: body.id, revoked: true, alreadyRevoked: false });
  },
);
