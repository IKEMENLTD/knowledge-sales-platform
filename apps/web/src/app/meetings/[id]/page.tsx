import { requireUser } from '@/lib/auth/server';
import {
  DEMO_CONTACTS,
  DEMO_MEETINGS,
  DEMO_MEMBERS,
  DEMO_RECORDINGS,
  type DemoMeetingStage,
  findContact,
  findMember,
  findRecording,
} from '@/lib/demo/fixtures';
import { createServerClient } from '@/lib/supabase/server';
import type { MeetingStage } from '@ksp/shared';
import { notFound } from 'next/navigation';
import { AiSummaryPanel } from './_components/ai-summary-panel';
import { type Commitment, CommitmentsList } from './_components/commitments-list';
import { type HandoffCandidate, HandoffDialog } from './_components/handoff-dialog';
import { ManualNotes } from './_components/manual-notes';
import { MeetingHeader } from './_components/meeting-header';
import { type RelatedContact, RelatedContacts } from './_components/related-contacts';
import { type RelatedRecording, RelatedRecordings } from './_components/related-recordings';
import { StageHistory, type StageTransition } from './_components/stage-history';

export const metadata = { title: '商談の詳細' };

/**
 * 商談詳細 (SC-15 / T-014)。
 *
 * Server Component。`requireUser()` で auth + role check。
 * Supabase から meeting / attendees / recordings / contacts / stage_transitions を順に取得し、
 * いずれかが失敗 (テーブル未生成・401・空) した場合は demo fixtures で fallback する。
 * fixture fallback 時は `isSample = true` を子に渡し、書込系操作を抑止する。
 */
export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const result = await loadMeetingDetail(id);
  if (!result) {
    // demo / live どちらでも見つからなければ 404
    notFound();
  }

  const view = result;

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 営業 / 商談 詳細</p>
        {view.isSample ? <MeetingSampleBadge /> : null}
      </div>

      <SectionLead no="02" label="商談の表紙" />
      <MeetingHeader
        meetingId={view.id}
        title={view.title}
        companyName={view.companyName}
        ownerName={view.ownerName}
        ownerInitials={view.ownerInitials}
        scheduledAt={view.scheduledAt}
        durationMin={view.durationMin}
        zoomJoinUrl={view.zoomJoinUrl}
        calendarUrl={view.calendarUrl}
        stage={view.stage}
        dealAmount={view.dealAmount}
        dealCloseDate={view.dealCloseDate}
        isSample={view.isSample}
      />

      <div className="hairline" aria-hidden />

      <SectionLead no="03" label="AI が読み解いた中身" />
      <AiSummaryPanel
        meetingId={view.id}
        summary={view.aiSummary}
        keyPoints={view.keyPoints}
        customerNeeds={view.customerNeeds}
        objections={view.objections}
        isSample={view.isSample}
      />

      <div className="hairline" aria-hidden />

      <SectionLead no="04" label="約束と次の一手" />
      <CommitmentsList
        meetingId={view.id}
        initialCommitments={view.commitments}
        nextAction={view.nextAction}
        isSample={view.isSample}
      />

      <div className="hairline" aria-hidden />

      <SectionLead no="05" label="関連する人と録画" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <RelatedRecordings recordings={view.relatedRecordings} />
        <RelatedContacts contacts={view.relatedContacts} />
      </div>

      <div className="hairline" aria-hidden />

      <SectionLead no="06" label="現場メモ" />
      <ManualNotes meetingId={view.id} initialNotes={view.manualNotes} isSample={view.isSample} />

      <div className="hairline" aria-hidden />

      <SectionLead no="07" label="ステージの軌跡" />
      <StageHistory transitions={view.transitions} />

      <div className="hairline" aria-hidden />

      <section
        aria-labelledby="handoff-heading"
        className="flex items-center justify-between gap-4 flex-wrap"
      >
        <div className="space-y-1">
          <p className="kicker">№ 08 — 引き継ぎ</p>
          <h2 id="handoff-heading" className="display text-lg font-semibold tracking-crisp">
            CS への引き継ぎ
          </h2>
          <p className="text-sm text-muted-foreground max-w-prose">
            受注後の運用を担当するメンバーへ、要約・約束事項・次のアクションをまとめて渡します。
          </p>
        </div>
        <HandoffDialog
          meetingId={view.id}
          candidates={view.handoffCandidates}
          draftNotesSeed={buildHandoffDraft(view)}
          isSample={view.isSample}
        />
      </section>

      {/* 落款 (inkan accent) — ページ末の編集的締め */}
      <div className="flex justify-end pt-2">
        <span
          aria-hidden
          className="inline-block size-3.5 rounded-[3px] bg-cinnabar/35"
          title="落款"
        />
      </div>
    </div>
  );
}

/** セクションリード — 「№ NN — ラベル」を hairline 下に置くための小さい kicker。 */
function SectionLead({ no, label }: { no: string; label: string }) {
  return (
    <p className="kicker -mb-4 mt-0">
      № {no} — {label}
    </p>
  );
}

/** 統一サンプルバッジ — 商談詳細ヘッダ用。 */
function MeetingSampleBadge() {
  return (
    <span
      aria-label="サンプルデータ"
      className="px-2 h-5 inline-flex items-center rounded-full border border-dashed border-cinnabar/35 bg-cinnabar/5 text-cinnabar text-[10px] tracking-kicker uppercase"
    >
      サンプル
    </span>
  );
}

// ============================================================================
// View model
// ============================================================================

type DetailView = {
  id: string;
  title: string;
  companyName: string;
  ownerName: string | null;
  ownerInitials: string | null;
  scheduledAt: string | null;
  durationMin: number | null;
  zoomJoinUrl: string | null;
  calendarUrl: string | null;
  stage: MeetingStage | null;
  dealAmount: number | null;
  dealCloseDate: string | null;
  aiSummary: string | null;
  keyPoints: string[];
  customerNeeds: string[];
  objections: string[];
  commitments: Commitment[];
  nextAction: string | null;
  manualNotes: string;
  relatedRecordings: RelatedRecording[];
  relatedContacts: RelatedContact[];
  transitions: StageTransition[];
  handoffCandidates: HandoffCandidate[];
  isSample: boolean;
};

async function loadMeetingDetail(id: string): Promise<DetailView | null> {
  // ----- 1) live DB attempt -----
  // `demo-` prefix なら問答無用で fixture を返す (本番には混在しない仕様)
  if (!id.startsWith('demo-')) {
    try {
      const live = await loadFromSupabase(id);
      if (live) return live;
    } catch {
      // 続けて fixture fallback
    }
  }

  // ----- 2) demo fixture fallback -----
  return loadFromFixture(id);
}

async function loadFromSupabase(id: string): Promise<DetailView | null> {
  const supabase = await createServerClient();

  // meeting 本体。0036 migration 前でも壊れないよう、最小列で試す。
  const { data: meetingRow, error: meetingErr } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (meetingErr || !meetingRow) return null;

  const meeting = meetingRow as Record<string, unknown>;

  // attendees
  const { data: attendeesRows } = await supabase
    .from('meeting_attendees')
    .select('id,attendee_type,user_id,contact_id,role')
    .eq('meeting_id', id);

  const contactIds: string[] = [];
  for (const row of (attendeesRows ?? []) as Record<string, unknown>[]) {
    if (row.attendee_type === 'external_contact' && typeof row.contact_id === 'string') {
      contactIds.push(row.contact_id);
    }
  }

  // attendee contacts
  // P0-M-05 fix: 実 schema は contacts.name + contacts.title + contacts.company_id → companies.name JOIN。
  // 旧コードは full_name / job_title / company_name を直接 SELECT して常に PostgREST エラー → fixture fallback 化していた。
  const attendeeContacts = contactIds.length
    ? ((
        await supabase
          .from('contacts')
          .select('id,name,title,company_id,email')
          .in('id', contactIds)
      ).data ?? [])
    : [];

  // 会社名は contact.company_id 経由で companies テーブルから引く。
  const attendeeCompanyIds = (attendeeContacts as Record<string, unknown>[])
    .map((c) => c.company_id)
    .filter((v): v is string => typeof v === 'string');

  // 同社の関連 contacts: 先頭 attendee の company_id を基点に絞り込み (会社名ではなく id で結合)。
  const baseCompanyId = attendeeCompanyIds[0] ?? null;
  let relatedContactsRows: Record<string, unknown>[] = [];
  if (baseCompanyId) {
    const { data } = await supabase
      .from('contacts')
      .select('id,name,title,company_id,email')
      .eq('company_id', baseCompanyId)
      .neq('id', contactIds.length ? contactIds[0] : '00000000-0000-0000-0000-000000000000')
      .limit(20);
    relatedContactsRows = (data as Record<string, unknown>[] | null) ?? [];
  }

  // 会社マスタ (id → name) を attendee + related の company_id 合算で 1 度に取得。
  const allCompanyIds = [
    ...new Set(
      [
        ...attendeeCompanyIds,
        ...relatedContactsRows
          .map((c) => c.company_id)
          .filter((v): v is string => typeof v === 'string'),
      ].filter(Boolean),
    ),
  ];
  const companyRows = allCompanyIds.length
    ? (((await supabase.from('companies').select('id,name').in('id', allCompanyIds)).data ??
        []) as Record<string, unknown>[])
    : [];
  const companyNameById = new Map(
    companyRows.map((co) => [co.id as string, (co.name as string | null) ?? null]),
  );
  const companyName: string | undefined = baseCompanyId
    ? (companyNameById.get(baseCompanyId) ?? undefined)
    : undefined;

  // recordings (この meeting に紐づく)
  const { data: recordingsRows } = await supabase
    .from('recordings')
    .select(
      'id,zoom_recording_id,video_duration_seconds,summary,key_points,customer_needs,objections,commitments,processing_status,processed_at,created_at',
    )
    .eq('meeting_id', id);

  // stage transitions (テーブルが無い環境ではエラー無視)
  // P0-M-04 fix: 実 schema は `created_at` / `changed_by_user_id` (0036_meetings_phase2.sql)。
  // 旧コードは `changed_at` / `changed_by` を SELECT していて常に PostgREST エラー → 空表示化していた。
  let transitions: StageTransition[] = [];
  try {
    const { data: trans } = await supabase
      .from('meeting_stage_transitions')
      .select(
        'id,from_stage,to_stage,reason,from_deal_status,to_deal_status,changed_by_user_id,created_at',
      )
      .eq('meeting_id', id)
      .order('created_at', { ascending: false });
    if (trans) {
      const changerIds = Array.from(
        new Set(
          trans
            .map((t) => (t as Record<string, unknown>).changed_by_user_id)
            .filter((v): v is string => typeof v === 'string'),
        ),
      );
      const changers = changerIds.length
        ? ((await supabase.from('users').select('id,name').in('id', changerIds)).data ?? [])
        : [];
      const nameById = new Map(
        (changers as Record<string, unknown>[]).map((u) => [
          u.id as string,
          (u.name as string | null) ?? null,
        ]),
      );
      transitions = (trans as Record<string, unknown>[]).map((t) => ({
        id: t.id as string,
        fromStage: (t.from_stage as MeetingStage | null) ?? null,
        toStage: t.to_stage as MeetingStage,
        changedAt: typeof t.created_at === 'string' ? t.created_at : new Date().toISOString(),
        changedByName:
          typeof t.changed_by_user_id === 'string'
            ? (nameById.get(t.changed_by_user_id) ?? null)
            : null,
        reason: (t.reason as string | null) ?? null,
      }));
    }
  } catch {
    transitions = [];
  }

  // CS handoff candidates
  let handoffCandidates: HandoffCandidate[] = [];
  try {
    const { data: csUsers } = await supabase
      .from('users')
      .select('id,name,role')
      .eq('is_active', true)
      .in('role', ['cs', 'manager']);
    handoffCandidates = ((csUsers ?? []) as Record<string, unknown>[]).map((u) => ({
      id: u.id as string,
      fullName: (u.name as string | null) ?? '名前未設定',
      role: u.role as HandoffCandidate['role'],
      department: null,
    }));
  } catch {
    handoffCandidates = [];
  }

  // owner 名前
  let ownerName: string | null = null;
  let ownerInitials: string | null = null;
  if (typeof meeting.owner_user_id === 'string') {
    const { data: ownerRow } = await supabase
      .from('users')
      .select('name')
      .eq('id', meeting.owner_user_id)
      .maybeSingle();
    if (ownerRow?.name) {
      ownerName = ownerRow.name as string;
      ownerInitials = initialsOf(ownerName);
    }
  }

  // recordings → 集約 AI 結果
  const aggregated = aggregateRecordings(
    (recordingsRows as Record<string, unknown>[] | null) ?? [],
  );

  const relatedRecordings: RelatedRecording[] = (
    (recordingsRows as Record<string, unknown>[] | null) ?? []
  ).map((r) => ({
    id: r.id as string,
    title: (r.zoom_recording_id as string | null) ?? `録画 ${(r.id as string).slice(0, 8)}`,
    recordedAt: (r.processed_at as string | null) ?? (r.created_at as string | null),
    durationSec: (r.video_duration_seconds as number | null) ?? null,
    summary: (r.summary as string | null) ?? null,
  }));

  // P0-M-05 fix: contacts は (name, title, company_id) を読み、companyName は companies JOIN で解決する。
  const relatedContacts: RelatedContact[] = [
    ...(attendeeContacts as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      fullName: (c.name as string | null) ?? '名前未設定',
      title: (c.title as string | null) ?? null,
      companyName:
        typeof c.company_id === 'string' ? (companyNameById.get(c.company_id) ?? null) : null,
      email: (c.email as string | null) ?? null,
      isAttendee: true,
    })),
    ...relatedContactsRows.map((c) => ({
      id: c.id as string,
      fullName: (c.name as string | null) ?? '名前未設定',
      title: (c.title as string | null) ?? null,
      companyName:
        typeof c.company_id === 'string' ? (companyNameById.get(c.company_id) ?? null) : null,
      email: (c.email as string | null) ?? null,
      isAttendee: false,
    })),
  ];

  return {
    id: meeting.id as string,
    title: (meeting.title as string | null) ?? '無題の商談',
    companyName: companyName ?? '会社名未設定',
    ownerName,
    ownerInitials,
    scheduledAt: (meeting.scheduled_at as string | null) ?? null,
    durationMin: (meeting.duration_minutes as number | null) ?? null,
    zoomJoinUrl: (meeting.zoom_join_url as string | null) ?? null,
    calendarUrl: extractCalendarUrl(meeting),
    stage: (meeting.stage as MeetingStage | null) ?? null,
    dealAmount: (meeting.deal_amount as number | null) ?? null,
    dealCloseDate: (meeting.deal_close_date as string | null) ?? null,
    aiSummary: aggregated.summary,
    keyPoints: aggregated.keyPoints,
    customerNeeds: aggregated.customerNeeds,
    objections: aggregated.objections,
    commitments: aggregated.commitments,
    nextAction: (meeting.next_action as string | null) ?? null,
    manualNotes: (meeting.manual_notes as string | null) ?? '',
    relatedRecordings,
    relatedContacts,
    transitions,
    handoffCandidates,
    isSample: false,
  };
}

function aggregateRecordings(rows: Record<string, unknown>[]): {
  summary: string | null;
  keyPoints: string[];
  customerNeeds: string[];
  objections: string[];
  commitments: Commitment[];
} {
  const summaries: string[] = [];
  const keyPoints: string[] = [];
  const customerNeeds: string[] = [];
  const objections: string[] = [];
  const commitments: Commitment[] = [];

  for (const r of rows) {
    const s = r.summary as string | null;
    if (s) summaries.push(s);
    keyPoints.push(...toStringArray(r.key_points));
    customerNeeds.push(...toStringArray(r.customer_needs));
    objections.push(...toStringArray(r.objections));

    const cs = Array.isArray(r.commitments) ? (r.commitments as unknown[]) : [];
    cs.forEach((item, idx) => {
      const obj = item as Record<string, unknown>;
      commitments.push({
        id: typeof obj.id === 'string' ? obj.id : `${r.id as string}-${idx}`,
        atSec:
          typeof obj.atSec === 'number'
            ? obj.atSec
            : typeof obj.at_sec === 'number'
              ? obj.at_sec
              : null,
        text: typeof obj.text === 'string' ? obj.text : String(obj.text ?? ''),
        done:
          typeof obj.done === 'boolean'
            ? obj.done
            : typeof obj.completed === 'boolean'
              ? obj.completed
              : false,
        recordingId: r.id as string,
      });
    });
  }

  return {
    summary: summaries.length ? summaries.join('\n\n') : null,
    keyPoints,
    customerNeeds,
    objections,
    commitments,
  };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object' && 'text' in x) {
        const t = (x as Record<string, unknown>).text;
        return typeof t === 'string' ? t : '';
      }
      return '';
    })
    .filter(Boolean);
}

function extractCalendarUrl(meeting: Record<string, unknown>): string | null {
  const evId = meeting.google_calendar_event_id;
  if (typeof evId !== 'string' || !evId) return null;
  // 仕様詳細は不明なため、event id のみ表示 URL を組み立てる (公開ビュー)。
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(evId)}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return name.slice(0, 2);
}

// ============================================================================
// Demo fallback
// ============================================================================

const DEMO_STAGE_MAP: Record<DemoMeetingStage, MeetingStage> = {
  scheduled: 'first',
  in_progress: 'demo',
  won: 'closing',
  lost: 'negotiation',
  on_hold: 'cs_regular',
};

function loadFromFixture(id: string): DetailView | null {
  // id 完全一致 → なければ最初の demo を返す (任意 UUID でも UI が見えるように)
  const meeting = DEMO_MEETINGS.find((m) => m.id === id) ?? DEMO_MEETINGS[0];
  if (!meeting) return null;

  const owner = findMember(meeting.ownerId);
  const attendees = meeting.attendeeIds
    .map((aid) => findContact(aid))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const relatedContacts: RelatedContact[] = [
    ...attendees.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      title: c.title,
      companyName: c.companyName,
      email: c.email,
      isAttendee: true,
    })),
    ...DEMO_CONTACTS.filter(
      (c) => c.companyName === meeting.companyName && !meeting.attendeeIds.includes(c.id),
    ).map((c) => ({
      id: c.id,
      fullName: c.fullName,
      title: c.title,
      companyName: c.companyName,
      email: c.email,
      isAttendee: false,
      pastMeetingCount: DEMO_MEETINGS.filter(
        (m) => m.attendeeIds.includes(c.id) && m.id !== meeting.id,
      ).length,
    })),
  ];

  const recording = meeting.recordingId ? findRecording(meeting.recordingId) : undefined;
  const relatedRecordings: RelatedRecording[] = recording
    ? [
        {
          id: recording.id,
          title: recording.title,
          recordedAt: recording.recordedAt,
          durationSec: recording.durationSec,
          summary: recording.aiSummary,
        },
      ]
    : DEMO_RECORDINGS.filter((r) => r.meetingId === meeting.id).map((r) => ({
        id: r.id,
        title: r.title,
        recordedAt: r.recordedAt,
        durationSec: r.durationSec,
        summary: r.aiSummary,
      }));

  const commitments: Commitment[] = meeting.commitments.map((c, idx) => ({
    id: `${meeting.id}-c-${idx}`,
    atSec: c.atSec,
    text: c.text,
    done: false,
    recordingId: meeting.recordingId ?? null,
  }));

  const transitions: StageTransition[] = (() => {
    // demo の stage_transitions は持っていないので、scheduledAt を起点に擬似的に 1-2 行作る
    const base = new Date(meeting.scheduledAt);
    const t1: StageTransition = {
      id: `${meeting.id}-t-0`,
      fromStage: null,
      toStage: 'first',
      changedAt: new Date(base.getTime() - 14 * 86_400_000).toISOString(),
      changedByName: owner?.fullName ?? null,
      reason: '初回ヒアリングを設定',
    };
    const current = DEMO_STAGE_MAP[meeting.stage];
    if (current === 'first') return [t1];
    return [
      {
        id: `${meeting.id}-t-1`,
        fromStage: 'first',
        toStage: current,
        changedAt: meeting.scheduledAt,
        changedByName: owner?.fullName ?? null,
        reason:
          meeting.stage === 'won'
            ? '受注合意'
            : meeting.stage === 'lost'
              ? '失注確定'
              : '進行中ステージへ',
      },
      t1,
    ];
  })();

  const handoffCandidates: HandoffCandidate[] = DEMO_MEMBERS.filter(
    (m) =>
      m.status === 'active' &&
      (m.role === 'manager' || m.role === 'admin') &&
      m.id !== meeting.ownerId,
  ).map((m) => ({
    id: m.id,
    fullName: m.fullName,
    // demo の role は admin/manager/member。CS は無いので manager で表示。
    role: m.role === 'admin' ? 'admin' : 'manager',
    department: m.department,
  }));

  // 録画ベースで AI 結果を擬似生成 (fixture には key_points 等は無い)
  const keyPoints: string[] = recording?.highlights.map((h) => h.label) ?? [];
  const customerNeeds: string[] =
    meeting.stage === 'in_progress'
      ? ['商談の属人化を解消したい', '録画の検索性を高めたい', '権限管理を運用負荷低く回したい']
      : [];
  const objections: string[] =
    meeting.stage === 'lost'
      ? ['今期の IT 予算が枯渇', '組み込み工数の懸念']
      : meeting.stage === 'won'
        ? ['3 年契約に対する価格懸念 (合意済)']
        : [];

  return {
    id: meeting.id,
    title: meeting.title,
    companyName: meeting.companyName,
    ownerName: owner?.fullName ?? null,
    ownerInitials: owner?.initials ?? null,
    scheduledAt: meeting.scheduledAt,
    durationMin: meeting.durationMin,
    zoomJoinUrl: 'https://zoom.us/j/000-demo',
    calendarUrl: null,
    stage: DEMO_STAGE_MAP[meeting.stage],
    dealAmount: meeting.amountJpy > 0 ? meeting.amountJpy : null,
    dealCloseDate: null,
    aiSummary: meeting.aiSummary,
    keyPoints,
    customerNeeds,
    objections,
    commitments,
    nextAction: meeting.nextAction,
    manualNotes: '',
    relatedRecordings,
    relatedContacts,
    transitions,
    handoffCandidates,
    isSample: true,
  };
}

function buildHandoffDraft(view: DetailView): string {
  const lines: string[] = [];
  lines.push(`## ${view.companyName} / ${view.title}`);
  if (view.scheduledAt) {
    lines.push(`商談日時: ${view.scheduledAt}`);
  }
  lines.push('');
  if (view.aiSummary) {
    lines.push('### 要約');
    lines.push(view.aiSummary);
    lines.push('');
  }
  if (view.commitments.length) {
    lines.push('### 約束したこと');
    for (const c of view.commitments) {
      lines.push(`- [${c.done ? 'x' : ' '}] ${c.text}`);
    }
    lines.push('');
  }
  if (view.nextAction) {
    lines.push('### 次のアクション');
    lines.push(`- ${view.nextAction}`);
  }
  return lines.join('\n');
}
