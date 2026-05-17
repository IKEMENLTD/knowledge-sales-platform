/**
 * 録画一覧 (Server Component) 用の DB load 関数。
 *
 * - RLS で sensitivity × role × owner の事前絞り込みは Supabase 側に委ねる。
 * - 失敗時 (migration 未適用 / RLS 拒否 / column 欠落) はログ後に fixture fallback。
 *   "isFallback" を付けて view 側で "サンプル" バッジを出せるようにする。
 */

import { DEMO_MEETINGS, DEMO_MEMBERS, DEMO_RECORDINGS } from '@/lib/demo/fixtures';
import { createServerClient } from '@/lib/supabase/server';
// NOTE: `server-only` パッケージは monorepo に未インストール。
// このファイルは page.tsx (server component) からのみ import されるため、
// createServerClient (cookies() を呼ぶ) が誤って client から呼ばれた瞬間に
// next/headers の制約で実行時エラーになる仕組みで間接的に守られる。
import { type RecordingListQuery, recordingListQuerySchema } from '@ksp/shared';

export type RecordingProcessingStatus =
  | 'pending'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'embedding'
  | 'completed'
  | 'failed';

export type RecordingSensitivity = 'public' | 'internal' | 'sensitive' | 'restricted';

export type SpeakerSplit = { name: string; pct: number };
export type RecordingHighlight = { atSec: number; label: string; kind?: string };

/**
 * 一覧 card が必要とする情報の最小セット (詳細画面の I/O とは別物)。
 * fixture と DB row のどちらでも同じ形に揃えるための view-model。
 */
export type RecordingListItem = {
  id: string;
  meetingId: string | null;
  title: string;
  recordedAt: string; // ISO
  durationSec: number;
  processingStatus: RecordingProcessingStatus;
  processingError: string | null;
  /** transcribing/analyzing/embedding 中の 0-100 概算。完了時 100、失敗時 null。 */
  progressPct: number | null;
  sensitivity: RecordingSensitivity;
  /** AI summary — 完了前は null。 */
  aiSummary: string | null;
  /** sparkline 用。-1..1 を 0..100 に正規化済み。 */
  sentimentCurve: number[];
  speakerSplit: SpeakerSplit[];
  highlights: RecordingHighlight[];
  /** 紐づく商談メタ。owner 名は users join 経由。 */
  meeting: {
    id: string;
    title: string;
    companyName: string | null;
    ownerUserId: string | null;
    ownerFullName: string | null;
    ownerInitials: string | null;
  } | null;
  /** fixture から来た場合 true。view 側で "サンプル" badge を表示。 */
  isFallback: boolean;
};

export type RecordingListResult = {
  items: RecordingListItem[];
  totalDurationSec: number;
  processingCount: number;
  failedCount: number;
  totalCount: number;
  /** owner select の選択肢。fixture/DB どちらでも揃える。 */
  owners: { id: string; fullName: string }[];
  isFallback: boolean;
  /** DB が空 / アクセス不可 / fallback だった理由。observability 用。 */
  fallbackReason: string | null;
};

const STATUS_PROGRESS: Record<RecordingProcessingStatus, number | null> = {
  pending: 5,
  downloading: 20,
  transcribing: 50,
  analyzing: 75,
  embedding: 90,
  completed: 100,
  failed: null,
};

function statusToProgress(s: RecordingProcessingStatus): number | null {
  return STATUS_PROGRESS[s] ?? null;
}

/**
 * sentiment_timeline (jsonb) は `[{ atSec, value: -1..1 }, ...]` 想定。
 * sparkline は 0..100 の数列を期待するので正規化する。
 */
function normalizeSentiment(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const sample of raw) {
    if (!sample || typeof sample !== 'object') continue;
    const v = (sample as Record<string, unknown>).value;
    if (typeof v === 'number' && Number.isFinite(v)) {
      // -1..1 を 0..100 に。範囲外は clamp。
      const pct = Math.max(0, Math.min(100, Math.round((v + 1) * 50)));
      out.push(pct);
    }
  }
  return out;
}

function normalizeHighlights(raw: unknown): RecordingHighlight[] {
  if (!Array.isArray(raw)) return [];
  const out: RecordingHighlight[] = [];
  for (const h of raw) {
    if (!h || typeof h !== 'object') continue;
    const r = h as Record<string, unknown>;
    const at =
      typeof r.atSec === 'number' ? r.atSec : typeof r.at_sec === 'number' ? r.at_sec : null;
    const label = typeof r.label === 'string' ? r.label : null;
    if (at === null || label === null) continue;
    out.push({
      atSec: at,
      label,
      kind: typeof r.kind === 'string' ? r.kind : undefined,
    });
  }
  return out;
}

/**
 * 既存 fixture 形式 (DemoRecording.speakerSplit) は { name, pct }。
 * 本番では transcript_segments の集計結果が想定だが、まだ未確定なので
 * jsonb に { name, pct } 形式で入っていれば取り込む。
 */
function normalizeSpeakers(raw: unknown): SpeakerSplit[] {
  if (!Array.isArray(raw)) return [];
  const out: SpeakerSplit[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name : null;
    const pct = typeof r.pct === 'number' ? r.pct : null;
    if (name === null || pct === null) continue;
    out.push({ name, pct });
  }
  return out;
}

function initialsOf(name: string | null): string | null {
  if (!name) return null;
  // 日本語: 姓名 (空白区切り) → 各冒頭1文字。空白なし → 先頭1文字。
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const head = parts[0];
  if (!head) return null;
  if (parts.length >= 2) {
    const second = parts[1] ?? '';
    return (head.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  }
  return head.slice(0, 1).toUpperCase();
}

function fixtureItems(): RecordingListItem[] {
  return DEMO_RECORDINGS.map((r) => {
    const meeting = DEMO_MEETINGS.find((m) => m.id === r.meetingId);
    const owner = meeting ? DEMO_MEMBERS.find((u) => u.id === meeting.ownerId) : undefined;
    return {
      id: r.id,
      meetingId: r.meetingId,
      title: r.title,
      recordedAt: r.recordedAt,
      durationSec: r.durationSec,
      processingStatus: 'completed' as const,
      processingError: null,
      progressPct: 100,
      sensitivity: 'internal' as const,
      aiSummary: r.aiSummary,
      sentimentCurve: r.sentimentCurve,
      speakerSplit: r.speakerSplit,
      highlights: r.highlights,
      meeting: meeting
        ? {
            id: meeting.id,
            title: meeting.title,
            companyName: meeting.companyName,
            ownerUserId: meeting.ownerId,
            ownerFullName: owner?.fullName ?? null,
            ownerInitials: owner?.initials ?? null,
          }
        : null,
      isFallback: true,
    };
  });
}

function fixtureOwners(): { id: string; fullName: string }[] {
  return DEMO_MEMBERS.filter((m) => m.status !== 'suspended').map((m) => ({
    id: m.id,
    fullName: m.fullName,
  }));
}

function buildFallback(reason: string): RecordingListResult {
  const items = fixtureItems();
  return {
    items,
    totalDurationSec: items.reduce((s, r) => s + r.durationSec, 0),
    processingCount: 0,
    failedCount: 0,
    totalCount: items.length,
    owners: fixtureOwners(),
    isFallback: true,
    fallbackReason: reason,
  };
}

type RawRecordingRow = {
  id: string;
  meeting_id: string | null;
  video_duration_seconds: number | null;
  processing_status: string;
  processing_error: string | null;
  sensitivity: string | null;
  summary: string | null;
  sentiment_timeline: unknown;
  key_points: unknown;
  created_at: string;
  processed_at: string | null;
  meetings?: {
    id: string;
    title: string;
    scheduled_at: string | null;
    contacts?: { company_name: string | null } | null;
    owner_user_id: string | null;
    users?: { id: string; name: string | null } | null;
  } | null;
};

function applyClientSideFilter(rows: RawRecordingRow[], q: RecordingListQuery): RawRecordingRow[] {
  return rows.filter((r) => {
    if (q.ownerUserId && r.meetings?.owner_user_id !== q.ownerUserId) return false;
    if (q.status && r.processing_status !== q.status) return false;
    const ts = r.meetings?.scheduled_at ?? r.created_at;
    if (q.from && new Date(ts) < new Date(q.from)) return false;
    if (q.to && new Date(ts) > new Date(q.to)) return false;
    return true;
  });
}

/**
 * 録画一覧 + 関連 meeting + owner を一括取得する server-only entry point。
 *
 * @param rawQuery URL query 由来の任意 string 群。zod で validation。
 */
export async function loadRecordings(
  rawQuery: Record<string, string | undefined> = {},
): Promise<RecordingListResult> {
  // 1) query を zod で validation。失敗時は default を使う。
  const parsed = recordingListQuerySchema.safeParse({
    ownerUserId: rawQuery.ownerUserId || undefined,
    status: rawQuery.status || undefined,
    from: rawQuery.from || undefined,
    to: rawQuery.to || undefined,
    limit: rawQuery.limit ? Number(rawQuery.limit) : undefined,
    offset: rawQuery.offset ? Number(rawQuery.offset) : undefined,
  });
  const query: RecordingListQuery = parsed.success
    ? parsed.data
    : recordingListQuerySchema.parse({});

  // 2) Supabase Client。auth.uid() が cookie 経由でセットされる。
  let supabase: Awaited<ReturnType<typeof createServerClient>>;
  try {
    supabase = await createServerClient();
  } catch (err) {
    return buildFallback(`supabase_init_failed: ${(err as Error).message}`);
  }

  // 3) recordings + meetings + contacts + users を join。RLS は Supabase が自動適用。
  //    embed エラー (FK 未定義 / table 欠落) は catch 側で fallback。
  let listQuery = supabase
    .from('recordings')
    .select(
      `
        id,
        meeting_id,
        video_duration_seconds,
        processing_status,
        processing_error,
        sensitivity,
        summary,
        sentiment_timeline,
        key_points,
        created_at,
        processed_at,
        meetings:meeting_id (
          id,
          title,
          scheduled_at,
          owner_user_id,
          contacts:contact_id ( company_name ),
          users:owner_user_id ( id, name )
        )
      `,
    )
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (query.status) {
    listQuery = listQuery.eq('processing_status', query.status);
  }
  // owner / 期間は meetings 経由なので、ここでは status のみ DB filter する。
  // (PostgREST の関連テーブル filter は `meetings.owner_user_id=eq.x` の形で書けるが、
  //  embed type 推論がぶれるのでメモリ側で再 filter する方が堅牢)

  const { data, error } = await listQuery;
  if (error) {
    // よくある: relation "recordings" does not exist (42P01) → migration 未適用。
    return buildFallback(`db_select_failed: ${error.code ?? ''} ${error.message}`);
  }

  // 4) Aggregate 統計 (count/duration/processing/failed) は同 page で 1 リクエストにする。
  //    総件数は HEAD count で別途引く (filter 前) — RLS 後の見える総数。
  const { count: totalCount, error: countErr } = await supabase
    .from('recordings')
    .select('id', { count: 'exact', head: true });

  // owner 選択肢は users 表から。RLS で同 org のみ見える前提。
  const { data: ownerRows } = await supabase
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  const rows = ((data ?? []) as unknown as RawRecordingRow[]) ?? [];
  // owner / 期間はメモリ側で filter (上記コメント参照)
  const filteredRows = applyClientSideFilter(rows, query);

  // 5) DB が空 = レコード 0 件のときは fixture fallback。
  if (filteredRows.length === 0 && rows.length === 0 && !countErr && (totalCount ?? 0) === 0) {
    return buildFallback('db_empty');
  }

  const items: RecordingListItem[] = filteredRows.map((r) => {
    const meeting = r.meetings ?? null;
    const owner = meeting?.users ?? null;
    const recordedAt = meeting?.scheduled_at ?? r.created_at;
    const status = (r.processing_status as RecordingProcessingStatus) ?? 'pending';
    return {
      id: r.id,
      meetingId: r.meeting_id,
      title: meeting?.title ?? '（タイトル未取得）',
      recordedAt,
      durationSec: r.video_duration_seconds ?? 0,
      processingStatus: status,
      processingError: r.processing_error,
      progressPct: statusToProgress(status),
      sensitivity: (r.sensitivity as RecordingSensitivity) ?? 'internal',
      aiSummary: r.summary,
      sentimentCurve: normalizeSentiment(r.sentiment_timeline),
      speakerSplit: normalizeSpeakers(r.key_points),
      highlights: normalizeHighlights(r.key_points),
      meeting: meeting
        ? {
            id: meeting.id,
            title: meeting.title,
            companyName: meeting.contacts?.company_name ?? null,
            ownerUserId: meeting.owner_user_id,
            ownerFullName: owner?.name ?? null,
            ownerInitials: initialsOf(owner?.name ?? null),
          }
        : null,
      isFallback: false,
    };
  });

  const totalDurationSec = items.reduce((s, r) => s + (r.durationSec ?? 0), 0);
  const processingCount = items.filter(
    (i) => i.processingStatus !== 'completed' && i.processingStatus !== 'failed',
  ).length;
  const failedCount = items.filter((i) => i.processingStatus === 'failed').length;

  const owners: { id: string; fullName: string }[] = (ownerRows ?? [])
    .filter((u): u is { id: string; name: string } => typeof u.name === 'string')
    .map((u) => ({ id: u.id, fullName: u.name }));

  return {
    items,
    totalDurationSec,
    processingCount,
    failedCount,
    totalCount: totalCount ?? items.length,
    owners: owners.length > 0 ? owners : fixtureOwners(),
    isFallback: false,
    fallbackReason: null,
  };
}
