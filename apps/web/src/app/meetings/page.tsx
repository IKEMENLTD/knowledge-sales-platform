/**
 * 商談一覧 — Server Component。
 *
 * Phase 2L で demo fixture から実 DB 読み出しへ移行。
 *
 * 流れ:
 *   1. requireUser() でログイン強制 (未登録は /403)
 *   2. URL クエリ (stage / dealStatus / ownerUserId / q / from / to) を読み出し
 *   3. Supabase から meetings + meeting_attendees + recordings + users を join SELECT
 *   4. DB が空 (または列未生成 / エラー) なら demo fixture へ fallback し、UI 上「サンプル」badge
 *   5. 加重パイプライン (Σ amount × win_probability) を計算
 *   6. KanbanBoard (DnD + キーボード DnD + 楽観更新 + PATCH) へ pass
 *
 * 既存の SummaryStat 3 つは「加重パイプライン / 受注金額 / 次の商談」に再配置済。
 * ハードコードしていた NOW は new Date() に差し替え、production-ize。
 */

import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';
import {
  DEMO_MEETINGS,
  DEMO_MEMBERS,
  type DemoMeeting,
  type DemoMeetingStage,
  findContact,
  findMember,
  formatDateJp,
  formatJpy,
} from '@/lib/demo/fixtures';
import { createServerClient } from '@/lib/supabase/server';
import { Calendar, Filter, ListChecks, type Target, TrendingUp } from 'lucide-react';
import { KanbanBoard } from './_components/kanban-board';
import type { MeetingCardData } from './_components/meeting-card';
import type { FilterOwner } from './_components/meeting-filter-bar';
import { MeetingFilterBar } from './_components/meeting-filter-bar';
import { type ForecastMeeting, summarizePipeline } from './_lib/forecast';

export const metadata = { title: '商談' };

// SSR/SSG ともに最新化したいので動的レンダ。filter クエリも常に最新で評価される。
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

function readQ(sp: SP, key: string): string {
  const v = sp[key];
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

const ALLOWED_STAGES: DemoMeetingStage[] = ['scheduled', 'in_progress', 'won', 'lost', 'on_hold'];

const ALLOWED_DEAL_STATUS = ['open', 'won', 'lost', 'on_hold'] as const;
type DealStatus = (typeof ALLOWED_DEAL_STATUS)[number];

function sectionNo(n: number) {
  return `№ ${n.toString().padStart(2, '0')}`;
}

/**
 * DB の (status, deal_status) を kanban 論理ステージへ写像。
 *
 * 5 列 kanban は「予定 → 進行中 → 受注 / 失注 / 保留」のセールスフロー。
 * DB は status (商談実施状況) と deal_status (案件結果) の二軸なので合成する。
 */
function toKanbanStage(status: string | null, dealStatus: string | null): DemoMeetingStage {
  if (dealStatus === 'won') return 'won';
  if (dealStatus === 'lost') return 'lost';
  if (dealStatus === 'on_hold') return 'on_hold';
  // dealStatus === 'open' or null
  if (status === 'completed') return 'in_progress'; // 実施後・結果未確定 → 進行中
  if (status === 'cancelled' || status === 'no_show') return 'on_hold';
  return 'scheduled';
}

type DbMeetingRow = {
  id: string;
  title: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string | null;
  stage: string | null;
  deal_status: string | null;
  deal_amount: number | null;
  deal_close_date: string | null;
  owner_user_id: string;
  contact_id: string;
  next_action?: string | null;
  win_probability?: number | null;
  manual_notes: string | null;
};

type DbAttendeeRow = {
  meeting_id: string;
  attendee_type: string;
  contact_id: string | null;
  user_id: string | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type DbContactRow = {
  id: string;
  /** 実 schema は `contacts.name`。Round1 CTO HIGH-C-02 fix: full_name は存在しない。 */
  name: string | null;
  company_id: string | null;
};

type DbCompanyRow = {
  id: string;
  name: string | null;
};

type DbRecordingRow = {
  meeting_id: string;
  summary: string | null;
};

function initialsOf(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '—';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  const a = first[0] ?? '';
  const b = last[0] ?? '';
  return (a + b).toUpperCase();
}

async function loadFromDb(sp: SP): Promise<{
  cards: MeetingCardData[];
  owners: FilterOwner[];
} | null> {
  try {
    const supabase = await createServerClient();
    const stageQ = readQ(sp, 'stage');
    const dealStatusQ = readQ(sp, 'dealStatus');
    const ownerQ = readQ(sp, 'ownerUserId');
    const q = readQ(sp, 'q');
    const fromQ = readQ(sp, 'from');
    const toQ = readQ(sp, 'to');

    let query = supabase
      .from('meetings')
      .select(
        'id,title,scheduled_at,duration_minutes,status,stage,deal_status,deal_amount,deal_close_date,owner_user_id,contact_id,manual_notes,next_action,win_probability',
      )
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .limit(200);

    if (ALLOWED_DEAL_STATUS.includes(dealStatusQ as DealStatus)) {
      query = query.eq('deal_status', dealStatusQ);
    }
    if (ownerQ) {
      query = query.eq('owner_user_id', ownerQ);
    }
    if (fromQ) {
      query = query.gte('scheduled_at', `${fromQ}T00:00:00+09:00`);
    }
    if (toQ) {
      query = query.lte('scheduled_at', `${toQ}T23:59:59+09:00`);
    }
    if (q) {
      // タイトル / manual_notes / next_action の部分一致 (ilike)
      const pat = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      query = query.or(`title.ilike.${pat},manual_notes.ilike.${pat},next_action.ilike.${pat}`);
    }

    const { data: rawMeetings, error } = await query;
    if (error) {
      // next_action / win_probability 列が未生成な環境ではフォールバックして再 SELECT
      // (migration 0036 が未適用な dev 環境のサポート)
      const fb = await supabase
        .from('meetings')
        .select(
          'id,title,scheduled_at,duration_minutes,status,stage,deal_status,deal_amount,deal_close_date,owner_user_id,contact_id,manual_notes',
        )
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (fb.error || !fb.data || fb.data.length === 0) {
        return null;
      }
      return projectRows(fb.data as DbMeetingRow[], supabase, sp);
    }

    if (!rawMeetings || rawMeetings.length === 0) {
      return null; // 空なら fixture fallback
    }

    return projectRows(rawMeetings as DbMeetingRow[], supabase, sp);
  } catch {
    return null;
  }
}

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

async function projectRows(
  rows: DbMeetingRow[],
  supabase: ServerClient,
  sp: SP,
): Promise<{ cards: MeetingCardData[]; owners: FilterOwner[] }> {
  const ids = rows.map((r) => r.id);
  const ownerIds = [...new Set(rows.map((r) => r.owner_user_id))];
  const contactIds = [...new Set(rows.map((r) => r.contact_id))];

  const [attendeesRes, recordingsRes, usersRes, contactsRes] = await Promise.all([
    supabase
      .from('meeting_attendees')
      .select('meeting_id,attendee_type,contact_id,user_id')
      .in('meeting_id', ids),
    supabase.from('recordings').select('meeting_id,summary').in('meeting_id', ids),
    supabase.from('users').select('id,name,email').in('id', ownerIds),
    supabase.from('contacts').select('id,name,company_id').in('id', contactIds),
  ]);

  const attendees = (attendeesRes.data ?? []) as DbAttendeeRow[];
  const recordings = (recordingsRes.data ?? []) as DbRecordingRow[];
  const users = (usersRes.data ?? []) as DbUserRow[];
  const contacts = (contactsRes.data ?? []) as DbContactRow[];

  // companies は contact.company_id 経由で別 SELECT (Round1 CTO HIGH-C-02 fix)
  const companyIds = [
    ...new Set(contacts.map((c) => c.company_id).filter((v): v is string => Boolean(v))),
  ];
  const companies: DbCompanyRow[] = companyIds.length
    ? (((await supabase.from('companies').select('id,name').in('id', companyIds)).data ??
        []) as DbCompanyRow[])
    : [];
  const companyMap = new Map(companies.map((co) => [co.id, co]));

  const userMap = new Map(users.map((u) => [u.id, u]));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const recordingMap = new Map(recordings.map((r) => [r.meeting_id, r]));
  const attendeesByMeeting = new Map<string, DbAttendeeRow[]>();
  for (const a of attendees) {
    const arr = attendeesByMeeting.get(a.meeting_id) ?? [];
    arr.push(a);
    attendeesByMeeting.set(a.meeting_id, arr);
  }

  const stageQ = readQ(sp, 'stage');
  const ql = readQ(sp, 'q').toLowerCase();

  const cards: MeetingCardData[] = rows
    .map<MeetingCardData>((r) => {
      const owner = userMap.get(r.owner_user_id);
      const contact = contactMap.get(r.contact_id);
      const meetingAttendees = attendeesByMeeting.get(r.id) ?? [];
      const externalContactIds = meetingAttendees
        .filter((a) => a.attendee_type === 'external_contact' && a.contact_id)
        .map((a) => a.contact_id as string);
      const attendeeFullNames = externalContactIds
        .map((cid) => contactMap.get(cid)?.name)
        .filter((s): s is string => Boolean(s));
      const rec = recordingMap.get(r.id);
      const stage = toKanbanStage(r.status, r.deal_status);
      const companyName = contact?.company_id
        ? (companyMap.get(contact.company_id)?.name ?? '—')
        : '—';

      return {
        id: r.id,
        title: r.title,
        stage,
        companyName,
        scheduledAt: r.scheduled_at ?? new Date().toISOString(),
        durationMin: r.duration_minutes ?? 60,
        aiSummary: rec?.summary ?? r.manual_notes ?? '',
        nextAction: r.next_action ?? null,
        amountJpy: r.deal_amount ?? 0,
        ownerId: r.owner_user_id,
        ownerInitials: initialsOf(owner?.name),
        ownerFullName: owner?.name ?? null,
        attendeeIds: externalContactIds,
        attendeeFullNames,
        winProbability: r.win_probability ?? null,
        isDemo: false,
      };
    })
    .filter((c) => {
      if (stageQ && ALLOWED_STAGES.includes(stageQ as DemoMeetingStage)) {
        if (c.stage !== stageQ) return false;
      }
      if (ql) {
        const hay = `${c.title} ${c.companyName} ${c.nextAction ?? ''}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });

  const owners: FilterOwner[] = users
    .map((u) => ({ id: u.id, fullName: u.name ?? u.email ?? '担当者' }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ja'));

  return { cards, owners };
}

/** demo fixture → MeetingCardData の adapter */
function demoToCards(items: DemoMeeting[]): MeetingCardData[] {
  return items.map((m) => {
    const owner = findMember(m.ownerId);
    const attendeeFullNames = m.attendeeIds
      .map((id) => findContact(id)?.fullName)
      .filter((s): s is string => Boolean(s));
    return {
      id: m.id,
      title: m.title,
      stage: m.stage,
      companyName: m.companyName,
      scheduledAt: m.scheduledAt,
      durationMin: m.durationMin,
      aiSummary: m.aiSummary,
      nextAction: m.nextAction,
      amountJpy: m.amountJpy,
      ownerId: m.ownerId,
      ownerInitials: owner?.initials ?? null,
      ownerFullName: owner?.fullName ?? null,
      attendeeIds: m.attendeeIds,
      attendeeFullNames,
      winProbability: null, // demo は確度未指定 → stage default に委ねる
      isDemo: true,
    };
  });
}

function applyDemoFilters(items: MeetingCardData[], sp: SP): MeetingCardData[] {
  const stageQ = readQ(sp, 'stage');
  const ownerQ = readQ(sp, 'ownerUserId');
  const ql = readQ(sp, 'q').toLowerCase();
  const fromQ = readQ(sp, 'from');
  const toQ = readQ(sp, 'to');
  return items.filter((c) => {
    if (stageQ && ALLOWED_STAGES.includes(stageQ as DemoMeetingStage)) {
      if (c.stage !== stageQ) return false;
    }
    if (ownerQ && c.ownerId !== ownerQ) return false;
    if (ql) {
      const hay = `${c.title} ${c.companyName} ${c.nextAction ?? ''}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    if (fromQ) {
      if (new Date(c.scheduledAt) < new Date(`${fromQ}T00:00:00+09:00`)) return false;
    }
    if (toQ) {
      if (new Date(c.scheduledAt) > new Date(`${toQ}T23:59:59+09:00`)) return false;
    }
    return true;
  });
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireUser();
  const sp = await searchParams;

  const db = await loadFromDb(sp);
  const isFixtureMode = !db;
  let cards: MeetingCardData[];
  let owners: FilterOwner[];
  if (db) {
    cards = db.cards;
    owners = db.owners;
  } else {
    const all = demoToCards(DEMO_MEETINGS);
    cards = applyDemoFilters(all, sp);
    owners = DEMO_MEMBERS.filter((m) => m.status === 'active').map((m) => ({
      id: m.id,
      fullName: m.fullName,
    }));
  }

  // ForecastMeeting に正規化して KPI 計算
  const forecastInput: ForecastMeeting[] = cards.map((c) => ({
    id: c.id,
    stage: c.stage,
    amountJpy: c.amountJpy,
    winProbability: c.winProbability,
    scheduledAt: c.scheduledAt,
    closeDate: null,
  }));
  const summary = summarizePipeline(forecastInput);

  // 次の商談 — production-ize: ハードコード NOW を new Date() に差し替え
  const now = new Date();
  const nextMeeting = [...cards]
    .filter((c) => c.stage === 'scheduled' && new Date(c.scheduledAt) >= now)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];

  // tooltip 用 内訳の代表値: 進行中の最大金額カードを内訳サンプルに
  const sampleForTooltip =
    cards.find((c) => c.stage === 'in_progress' && c.amountJpy > 0) ??
    cards.find((c) => c.amountJpy > 0);

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">{sectionNo(1)} — 商談</p>
        <span className="kicker tabular">
          {cards.length} 件 {isFixtureMode ? '・サンプル' : ''}
        </span>
      </div>

      <header className="space-y-2 animate-fade-up max-w-3xl">
        <h1 className="display text-3xl md:text-[2.5rem] font-semibold tracking-crisp text-balance">
          商談を、流れで見渡す。
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground max-w-prose">
          ステージ別に並べた現場の全景。要約・約束事項・次の一手まで、各カードから 1
          タップで遡れます。 確度 × 金額の加重パイプラインも上部に集約しました。
        </p>
      </header>

      <section
        aria-label="パイプライン サマリ"
        className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-up [animation-delay:60ms]"
      >
        <SummaryStat
          kicker="加重パイプライン"
          metric={formatJpy(summary.pipelineWeighted)}
          hint={sampleForTooltip ? buildWeightedTooltip(sampleForTooltip) : 'Σ ( 確度 × 商談金額 )'}
          Icon={TrendingUp}
          no={sectionNo(2)}
        />
        <SummaryStat
          kicker="今月の受注"
          metric={formatJpy(summary.wonTotal)}
          hint={`ステージ「受注」の金額合計 ・ 加重 ${formatJpy(summary.wonWeighted)}`}
          Icon={ListChecks}
          no={sectionNo(3)}
        />
        <SummaryStat
          kicker="次の商談"
          metric={nextMeeting ? formatDateJp(nextMeeting.scheduledAt, true) : '—'}
          hint={nextMeeting?.companyName ?? '予定された商談はありません'}
          Icon={Calendar}
          no={sectionNo(4)}
        />
      </section>

      <div className="hairline" aria-hidden />

      <section aria-label="フィルタ" className="animate-fade-up [animation-delay:90ms] space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="section-no text-base">{sectionNo(5)}</span>
          <h2 className="display text-lg font-semibold tracking-crisp">フィルタ</h2>
          <span className="kicker inline-flex items-center gap-1">
            <Filter aria-hidden strokeWidth={1.6} className="size-3" />
            URL に同期
          </span>
        </div>
        <MeetingFilterBar owners={owners} />
      </section>

      <div className="hairline" aria-hidden />

      <section
        aria-label="ステージ別カンバン"
        aria-describedby="kanban-no"
        className="animate-fade-up [animation-delay:120ms] space-y-4"
      >
        <div className="flex items-baseline gap-3">
          <span id="kanban-no" className="section-no text-base">
            {sectionNo(6)}
          </span>
          <h2 className="display text-lg font-semibold tracking-crisp">ステージ別カンバン</h2>
          <span className="kicker">
            ドラッグ または カードのハンドル→Space で移動 ・ ← → で隣のステージ
          </span>
        </div>
        <KanbanBoard meetings={cards} isFixtureMode={isFixtureMode} />
      </section>
    </div>
  );
}

function buildWeightedTooltip(c: MeetingCardData): string {
  const prob = c.winProbability ?? null;
  // stage default を使って prob を解決
  const resolvedPct = (() => {
    if (prob === null || prob === undefined) {
      return {
        scheduled: 25,
        in_progress: 50,
        won: 100,
        lost: 0,
        on_hold: 10,
      }[c.stage];
    }
    return Math.round((prob > 1 ? prob / 100 : prob) * 100);
  })();
  const w = Math.round(c.amountJpy * (resolvedPct / 100));
  return `例: 確度 ${resolvedPct}% × ${formatJpy(c.amountJpy)} = 加重 ${formatJpy(w)}`;
}

function SummaryStat({
  kicker,
  metric,
  hint,
  Icon,
  no,
}: {
  kicker: string;
  metric: string;
  hint: string;
  Icon: typeof Target;
  no: string;
}) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="kicker">{kicker}</p>
        <span className="section-no text-base">{no}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <Icon aria-hidden strokeWidth={1.4} className="size-5 shrink-0 text-muted-foreground/60" />
        <p className="display tabular text-2xl font-semibold leading-none tracking-[-0.022em]">
          {metric}
        </p>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2" title={hint}>
        {hint}
      </p>
    </Card>
  );
}
