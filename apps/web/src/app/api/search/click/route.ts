import { defineRoute, errorResponse, ok } from '@/lib/api/route';
import { captureException } from '@/lib/sentry';
import { searchClickRequestSchema } from '@ksp/shared';

/**
 * POST /api/search/click
 *
 * 検索結果のクリック (CTR / LTR 用)。
 *   - body: searchClickRequestSchema { queryId, resultKind, resultId, rank, score? }
 *   - search_clicks に INSERT (RLS: 自分の row のみ insert 可)
 *   - Idempotency-Key 必須 (rapid double-click 抑止)
 *   - rateLimit: 60 cap / 1 token-per-sec (= 60 req/min)
 *
 * 設計判断:
 *   - queryId が search_queries に存在しない場合の整合性は FK で担保 (0037)。
 *     存在しなければ Postgres 23503 が返るので 400 に変換する。
 *   - sensitive な情報を含まないため失敗しても UI 体験を壊さない (best-effort)。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Round4 CTO MID + Security HIGH-S-05 fix: DEFAULT_ORG_ID は packages/shared から
// 取得し、AppUser.orgId を主参照、fallback にだけ DEFAULT_ORG_ID を使う。
export const POST = defineRoute(
  {
    body: searchClickRequestSchema,
    rateLimit: { capacity: 60, refillPerSecond: 1 },
  },
  async ({ body, user, supabase }) => {
    // Round4 fix: AppUser.orgId が requireApiUser で既に解決済。重複 SELECT を撤去。
    const orgId = user.orgId;

    try {
      const { error } = await supabase.from('search_clicks').insert({
        org_id: orgId,
        query_id: body.queryId,
        user_id: user.id,
        result_kind: body.resultKind,
        result_id: body.resultId,
        rank: body.rank,
        score: body.score ?? null,
      });
      if (error) {
        const code = (error as { code?: string }).code ?? '';
        if (code === '23503') {
          return errorResponse(400, 'query_not_found', 'queryId is unknown or expired');
        }
        if (code === '23505') {
          // 同じ key で連打 — 既に記録済とみなして 200
          return ok({ ok: true, duplicate: true });
        }
        throw error;
      }
    } catch (err) {
      captureException(err, { where: 'api/search/click', queryId: body.queryId });
      return errorResponse(500, 'click_insert_failed', 'failed to record click');
    }

    return ok({ ok: true });
  },
);
