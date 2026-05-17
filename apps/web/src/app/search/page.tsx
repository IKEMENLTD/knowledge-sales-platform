import {
  DEMO_CONTACTS,
  DEMO_MEETINGS,
  DEMO_RECORDINGS,
  findMeeting,
  formatDateJp,
  formatTimestamp,
} from '@/lib/demo/fixtures';
import { env } from '@/lib/env';
import { createServerClient } from '@/lib/supabase/server';
import {
  type SearchHit,
  type SearchRequest,
  type SearchResponse,
  searchRequestSchema,
  searchResponseSchema,
} from '@ksp/shared';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { ResultList } from './_components/result-list';
import { SearchForm, type SearchUserOption } from './_components/search-form';
import {
  DEFAULT_SUGGESTED_QUERIES,
  type RecentQuery,
  Suggestions,
} from './_components/suggestions';

export const metadata = { title: '検索' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 検索ページ — Server Component。
 *
 * Phase 2F (T-016):
 *  - URL クエリパラメータ (`q` / `kind` / `from` / `to` / `owner`) を
 *    `searchRequestSchema` に合わせて正規化する。
 *  - 正規化後、`POST /api/search` を server fetch で叩く (cookie 引き継ぎ)。
 *  - 失敗 (API 未実装 / 500 / network) 時は demo fixtures に degrade。
 *  - `search_queries` から自分の直近 5 件を取得して `Suggestions` に渡す。
 *  - 結果カードのトーン (No.ナンバリング / kicker / hairline / 注釈) は維持。
 */

const DEFAULT_QUERY = '価格交渉で押し返された商談';
const REWRITE_SUGGESTIONS = [
  '値下げ交渉',
  '導入時の懸念',
  '受注した理由',
  '失注の理由',
  '決裁者が同席',
] as const;

type SearchSearchParams = {
  q?: string | string[];
  kind?: string | string[];
  owner?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function sectionNo(n: number) {
  return `№ ${n.toString().padStart(2, '0')}`;
}

/** searchRequestSchema 互換のオブジェクトを URL から組み立てる。エラー時は best-effort fallback。 */
function buildRequest(sp: SearchSearchParams): SearchRequest {
  const qRaw = (pickFirst(sp.q) ?? '').trim();
  const q = qRaw.length === 0 ? DEFAULT_QUERY : qRaw;
  const candidate: Record<string, unknown> = { q };
  const kind = pickFirst(sp.kind);
  if (kind && ['all', 'recording', 'meeting', 'contact'].includes(kind)) {
    candidate.kind = kind;
  }
  const owner = pickFirst(sp.owner);
  if (owner && /^[0-9a-f-]{36}$/i.test(owner)) {
    candidate.ownerUserId = owner;
  }
  const from = pickFirst(sp.from);
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) candidate.from = d.toISOString();
  }
  const to = pickFirst(sp.to);
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) candidate.to = d.toISOString();
  }
  const parsed = searchRequestSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return searchRequestSchema.parse({ q: DEFAULT_QUERY });
}

/** /api/search を内部 fetch。Cookie を手で forward する。 */
async function callSearchApi(req: SearchRequest): Promise<{
  response: SearchResponse | null;
  degraded: boolean;
  reason?: string;
}> {
  try {
    const h = await headers();
    const cookie = h.get('cookie') ?? '';
    // host / proto を request header から組み立てる (Edge / Node 双方で動く)
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const base = host ? `${proto}://${host}` : env.APP_URL;

    const res = await fetch(`${base}/api/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        accept: 'application/json',
      },
      body: JSON.stringify(req),
      cache: 'no-store',
      // Server-internal fetch なので redirect は手動でハンドリングしない。
    });
    if (!res.ok) {
      return { response: null, degraded: true, reason: `api_status_${res.status}` };
    }
    const json = await res.json();
    const parsed = searchResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { response: null, degraded: true, reason: 'api_schema_mismatch' };
    }
    return { response: parsed.data, degraded: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network_error';
    return { response: null, degraded: true, reason };
  }
}

/** fixtures から degrade 用のサンプル結果を組み立てる。 */
function buildSampleHits(query: string): SearchHit[] {
  const tanaka = DEMO_MEETINGS.find((m) => m.id === 'demo-m-001');
  const phoenix = DEMO_MEETINGS.find((m) => m.id === 'demo-m-002');
  const recTanaka = DEMO_RECORDINGS.find((r) => r.id === 'demo-r-001');
  const recPhoenix = DEMO_RECORDINGS.find((r) => r.id === 'demo-r-002');
  const nakamura = DEMO_CONTACTS.find((c) => c.id === 'demo-c-001');

  const hits: SearchHit[] = [];
  if (recTanaka && tanaka) {
    hits.push({
      id: recTanaka.id,
      kind: 'recording',
      title: recTanaka.title,
      context: `${tanaka.companyName} ・ ${formatDateJp(tanaka.scheduledAt)}`,
      snippet:
        '中村部長: 「3 年契約にできるなら、価格面で何か工夫してもらえないかと思っています」鈴木: 「3 年契約の特別単価は社内で確認できますので、5/13 までに見積書をお送りします」',
      score: 0.92,
      scoreBreakdown: { vector: 0.88, bm25: 0.62, rrf: 0.054 },
      href: `/recordings/${recTanaka.id}`,
      atSec: 421,
    });
  }
  if (phoenix && recPhoenix) {
    hits.push({
      id: recPhoenix.id,
      kind: 'recording',
      title: recPhoenix.title,
      context: `${phoenix.companyName} ・ ${formatDateJp(phoenix.scheduledAt)}`,
      snippet:
        '小林課長: 「機能には満足してます。ただ、組み込みに 2 ヶ月かかるとなると、今期の予算では難しい」',
      score: 0.81,
      scoreBreakdown: { vector: 0.79, bm25: 0.45, rrf: 0.041 },
      href: `/recordings/${recPhoenix.id}`,
      atSec: 1135,
    });
  }
  if (tanaka) {
    hits.push({
      id: tanaka.id,
      kind: 'meeting',
      title: tanaka.title,
      context: `商談 ・ ${formatDateJp(tanaka.scheduledAt)}`,
      snippet: tanaka.aiSummary,
      score: 0.74,
      scoreBreakdown: { vector: 0.71, bm25: 0.4, rrf: 0.032 },
      href: `/meetings/${tanaka.id}`,
    });
  }
  if (nakamura) {
    const m = findMeeting('demo-m-001');
    hits.push({
      id: nakamura.id,
      kind: 'contact',
      title: `${nakamura.fullName} / ${nakamura.title}`,
      context: `${nakamura.companyName}`,
      snippet: `関連商談: ${m?.title ?? ''}。コスト最適化の決裁者で、年度予算は 4 月確定で動きやすい。`,
      score: 0.62,
      scoreBreakdown: { vector: 0.58, bm25: 0.36, rrf: 0.025 },
      href: `/contacts/${nakamura.id}/review`,
    });
  }
  // クエリで簡易フィルタ — 全てを「すべて」と扱う degrade なので、空でも全件返す。
  // ただし「録画」「商談」「名刺」と書かれた場合は kind 名で軽く絞る。
  if (/録画/.test(query)) return hits.filter((h) => h.kind === 'recording');
  if (/商談/.test(query)) return hits.filter((h) => h.kind === 'meeting');
  if (/名刺/.test(query)) return hits.filter((h) => h.kind === 'contact');
  return hits;
}

/** Supabase から users 一覧 (id, full_name) を取得。失敗時は空配列。 */
async function fetchUsers(): Promise<SearchUserOption[]> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('users')
      .select('id,name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(50);
    if (error || !data) return [];
    return data
      .map((u) => ({
        id: (u as { id: string }).id,
        fullName: ((u as { name: string | null }).name ?? '').trim() || '名前未設定',
      }))
      .filter((u) => /^[0-9a-f-]{36}$/i.test(u.id));
  } catch {
    return [];
  }
}

/** Supabase から自分の直近 5 件の検索履歴を取得。失敗 / 未マイグレーションは空。 */
async function fetchRecentQueries(currentQuery: string): Promise<RecentQuery[]> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('search_queries')
      .select('id,query_text,result_count,created_at')
      .order('created_at', { ascending: false })
      .limit(8);
    if (error || !data) return [];
    const seen = new Set<string>();
    const out: RecentQuery[] = [];
    for (const row of data) {
      const r = row as {
        id: string;
        query_text: string;
        result_count: number | null;
        created_at: string;
      };
      const q = (r.query_text ?? '').trim();
      if (!q || q === currentQuery) continue;
      if (seen.has(q)) continue;
      seen.add(q);
      out.push({
        id: r.id,
        query: q,
        createdAt: r.created_at,
        resultCount: r.result_count ?? 0,
      });
      if (out.length >= 5) break;
    }
    return out;
  } catch {
    return [];
  }
}

export default async function SearchPage(props: {
  searchParams?: Promise<SearchSearchParams>;
}) {
  const sp = (await props.searchParams) ?? {};
  const req = buildRequest(sp);

  // user / 履歴 / API は並列で取りに行く
  const [apiResult, users, recent] = await Promise.all([
    callSearchApi(req),
    fetchUsers(),
    fetchRecentQueries(req.q),
  ]);

  const degraded = apiResult.degraded;
  const response: SearchResponse =
    apiResult.response ??
    ({
      queryId: '00000000-0000-0000-0000-000000000000',
      query: req.q,
      total: 0,
      hits: buildSampleHits(req.q),
      durationMs: 0,
      demo: true,
    } satisfies SearchResponse);

  // degrade のとき hits を 0 にすると Empty State が出てしまうので fixtures から埋める。
  const hits = degraded ? buildSampleHits(req.q) : response.hits;
  const totalShown = degraded ? hits.length : response.total;
  const queryIdForClick = degraded ? null : response.queryId;

  const initialFromIso = pickFirst(sp.from) ?? null;
  const initialKind = (pickFirst(sp.kind) ?? 'all') as 'all' | 'recording' | 'meeting' | 'contact';
  const initialOwner = pickFirst(sp.owner) ?? null;

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">{sectionNo(1)} — 検索</p>
        <span className="kicker tabular">
          {totalShown} 件ヒット{degraded ? ' ・ サンプル' : ''}
        </span>
      </div>

      <header className="space-y-2 animate-fade-up">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          社の知見を、横断する。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          商談・録画・名刺を意味で検索。キーワード一致と文脈一致の両方で当てます。権限のないコンテンツは結果から自動的に除外されます。
        </p>
      </header>

      <section
        aria-labelledby="search-query-no"
        className="space-y-4 animate-fade-up [animation-delay:60ms]"
      >
        <div className="flex items-baseline gap-3">
          <span id="search-query-no" className="section-no text-base">
            {sectionNo(2)}
          </span>
          <h2 className="display text-sm font-semibold tracking-crisp">質問を入力</h2>
        </div>
        <Suspense fallback={null}>
          <SearchForm
            initialQuery={req.q}
            initialKind={initialKind}
            initialOwnerId={initialOwner}
            initialFromIso={initialFromIso}
            users={users}
            suggestions={DEFAULT_SUGGESTED_QUERIES}
          />
        </Suspense>
      </section>

      <div className="hairline" aria-hidden />

      {degraded ? (
        <output
          aria-live="polite"
          className="block rounded-md border border-amber-500/40 bg-amber-500/8 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm leading-relaxed"
        >
          <p>
            <span className="font-medium">現在の検索結果は固定のサンプルです。</span> 検索 API (
            {apiResult.reason ?? 'unavailable'}) が未応答のため、デモ fixtures
            を表示しています。本番接続後はクエリに応じてリアルタイムに変化します。
          </p>
        </output>
      ) : null}

      <section
        aria-labelledby="search-results-no"
        className="space-y-4 animate-fade-up [animation-delay:120ms]"
      >
        <div className="flex items-baseline gap-3">
          <span id="search-results-no" className="section-no text-base">
            {sectionNo(3)}
          </span>
          <h2 className="display text-lg font-semibold tracking-crisp truncate">
            「{req.q}」の結果
          </h2>
          {response.demo ? <span className="kicker">デモ</span> : null}
          {!degraded ? <span className="kicker tabular">{response.durationMs} ms</span> : null}
        </div>

        <ResultList
          query={req.q}
          queryId={queryIdForClick}
          hits={hits}
          rewriteSuggestions={REWRITE_SUGGESTIONS}
          currentKind={initialKind}
        />
      </section>

      <Suggestions popular={DEFAULT_SUGGESTED_QUERIES} recent={recent} currentQuery={req.q} />

      <aside
        className="rounded-xl border border-dashed border-cinnabar/35 bg-cinnabar/5 p-5 flex items-start gap-3 animate-fade-up [animation-delay:180ms]"
        aria-label="検索の仕組み"
      >
        <div className="space-y-1 text-sm">
          <p className="font-medium">セマンティック + キーワード ハイブリッド</p>
          <p className="text-muted-foreground leading-relaxed">
            録画の文字起こしは pgvector で意味検索、メタデータ (会社名・担当者)
            はキーワードで完全一致。両者のスコアを RRF
            で合算してランキングします。「なぜヒット」を押すと その内訳が見えます。Phase 2
            で再ランカー (LLM rerank) を追加予定。
          </p>
        </div>
      </aside>
    </div>
  );
}
