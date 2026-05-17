import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/server';
import {
  type DemoRecording,
  findMeeting,
  findMember,
  findRecording,
  formatDateJp,
  formatDuration,
} from '@/lib/demo/fixtures';
import { createServerClient } from '@/lib/supabase/server';
import { STORAGE_BUCKETS } from '@ksp/shared';
import { ArrowLeft, Mic, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { CommitmentItem, NextActionItem } from './_components/commitments-panel';
import { RecordingDetailClient } from './_components/recording-detail-client';
import type { SentimentPoint } from './_components/sentiment-chart';
import type { TranscriptSegmentLite } from './_components/transcript-pane';

export const metadata = { title: '録画の詳細' };

/**
 * 録画詳細ページ (SC-16)。
 *
 * Server Component。requireUser() で auth gate を通してから
 *  1. Supabase から recordings + recording_segments を取得
 *  2. 取得失敗・行なし・列未生成のいずれかなら DEMO_RECORDINGS から fallback
 *
 * RLS は sensitivity tier × role で prefilter 済 (recordings_select policy)。
 * 本ページから直接 SELECT を撃つだけで、認可違反は自然に「行なし」になる。
 */
type DetailViewModel = {
  recordingId: string;
  meetingTitle: string;
  meetingCompany: string;
  ownerName: string | null;
  recordedAtIso: string;
  durationSec: number;
  videoUrl: string | null;
  posterUrl: string | null;
  sensitivityLabel: string | null;
  summary: string | null;
  keyPoints: string[];
  customerNeeds: string[];
  objections: string[];
  transcriptSegments: TranscriptSegmentLite[];
  sentimentSamples: SentimentPoint[];
  highlights: { atSec: number; label: string }[];
  commitments: CommitmentItem[];
  nextActions: NextActionItem[];
  isSample: boolean;
};

const SENSITIVITY_LABELS: Record<string, string> = {
  public: '公開',
  internal: '社内',
  sensitive: '機微',
  restricted: '制限',
};

function toStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          return (
            (obj.what as string | undefined) ??
            (obj.label as string | undefined) ??
            (obj.text as string | undefined) ??
            (obj.title as string | undefined) ??
            JSON.stringify(obj)
          );
        }
        return String(v);
      })
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  }
  return [];
}

function toCommitmentList(raw: unknown, idPrefix: string): CommitmentItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.flatMap((v, i): CommitmentItem[] => {
    if (!v || typeof v !== 'object') {
      if (typeof v === 'string') {
        return [{ id: `${idPrefix}-${i}`, what: v }];
      }
      return [];
    }
    const obj = v as Record<string, unknown>;
    const what =
      (obj.what as string | undefined) ??
      (obj.text as string | undefined) ??
      (obj.label as string | undefined);
    if (!what) return [];
    const atSecRaw = obj.atSec ?? obj.at_sec ?? obj.atSeconds;
    const atSec =
      typeof atSecRaw === 'number'
        ? atSecRaw
        : typeof atSecRaw === 'string'
          ? Number.parseFloat(atSecRaw)
          : null;
    return [
      {
        id: `${idPrefix}-${i}`,
        who: (obj.who as string | undefined) ?? null,
        what,
        byWhen: (obj.byWhen as string | undefined) ?? (obj.by_when as string | undefined) ?? null,
        atSec: typeof atSec === 'number' && Number.isFinite(atSec) ? atSec : null,
      },
    ];
  });
}

function toNextActionList(raw: unknown, idPrefix: string): NextActionItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.flatMap((v, i): NextActionItem[] => {
    if (!v || typeof v !== 'object') {
      if (typeof v === 'string') {
        return [{ id: `${idPrefix}-${i}`, what: v }];
      }
      return [];
    }
    const obj = v as Record<string, unknown>;
    const what =
      (obj.what as string | undefined) ??
      (obj.text as string | undefined) ??
      (obj.label as string | undefined);
    if (!what) return [];
    return [
      {
        id: `${idPrefix}-${i}`,
        what,
        owner: (obj.owner as string | undefined) ?? null,
        dueDate:
          (obj.dueDate as string | undefined) ?? (obj.due_date as string | undefined) ?? null,
      },
    ];
  });
}

function toSentimentSamples(raw: unknown): SentimentPoint[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.flatMap((v): SentimentPoint[] => {
    if (!v || typeof v !== 'object') return [];
    const obj = v as Record<string, unknown>;
    const atSecRaw = obj.atSec ?? obj.at_sec;
    const valueRaw = obj.value;
    const atSec =
      typeof atSecRaw === 'number'
        ? atSecRaw
        : typeof atSecRaw === 'string'
          ? Number.parseFloat(atSecRaw)
          : null;
    const value =
      typeof valueRaw === 'number'
        ? valueRaw
        : typeof valueRaw === 'string'
          ? Number.parseFloat(valueRaw)
          : null;
    if (atSec === null || value === null || !Number.isFinite(atSec) || !Number.isFinite(value)) {
      return [];
    }
    return [
      {
        atSec,
        // -1..+1 にクリップ
        value: Math.max(-1, Math.min(1, value)),
        speakerLabel: (obj.speakerLabel as string | undefined) ?? null,
      },
    ];
  });
}

function fixtureToViewModel(rec: DemoRecording): DetailViewModel {
  const meeting = findMeeting(rec.meetingId);
  const owner = meeting ? findMember(meeting.ownerId) : undefined;
  // sentiment curve (0..100) を -1..+1 へ写像
  const sentimentSamples: SentimentPoint[] = rec.sentimentCurve.map((v, i, arr) => ({
    atSec: Math.round((rec.durationSec * i) / Math.max(1, arr.length - 1)),
    value: Math.max(-1, Math.min(1, (v - 50) / 50)),
    speakerLabel: null,
  }));
  // 文字起こしは fixture では excerpt 1 つしかないため、speakerSplit から疑似分割
  const baseText = rec.transcriptExcerpt;
  const transcriptSegments: TranscriptSegmentLite[] = (() => {
    // 「鈴木: 」「中村: 」のような話者プレフィックスで分割
    const parts = baseText.split(/(?=(?:[一-龯ぁ-んァ-ンA-Za-z]+):\s*「)/u).filter((s) => s.trim());
    if (parts.length === 0) {
      return [
        {
          index: 0,
          startSec: 0,
          endSec: rec.durationSec,
          speakerLabel: rec.speakerSplit[0]?.name ?? null,
          text: baseText,
        },
      ];
    }
    const span = rec.durationSec / parts.length;
    return parts.map((part, i) => {
      const m = part.match(/^([^:：]+)[:：]\s*「?(.*)$/u);
      const speaker = m?.[1]?.trim() ?? null;
      const text = (m?.[2] ?? part).replace(/」$/u, '').trim();
      return {
        index: i,
        startSec: Math.floor(i * span),
        endSec: Math.floor((i + 1) * span),
        speakerLabel: speaker,
        text,
      };
    });
  })();

  return {
    recordingId: rec.id,
    meetingTitle: meeting?.title ?? rec.title,
    meetingCompany: meeting?.companyName ?? '—',
    ownerName: owner?.fullName ?? null,
    recordedAtIso: rec.recordedAt,
    durationSec: rec.durationSec,
    videoUrl: null,
    posterUrl: null,
    sensitivityLabel: '社内',
    summary: rec.aiSummary,
    keyPoints: rec.highlights.map((h) => h.label),
    customerNeeds: meeting?.aiSummary ? [meeting.aiSummary] : [],
    objections: [],
    transcriptSegments,
    sentimentSamples,
    highlights: rec.highlights,
    commitments: (meeting?.commitments ?? []).map((c, i) => ({
      id: `${rec.id}-c-${i}`,
      what: c.text,
      atSec: c.atSec,
    })),
    nextActions: meeting?.nextAction ? [{ id: `${rec.id}-a-0`, what: meeting.nextAction }] : [],
    isSample: true,
  };
}

/**
 * recordings.video_storage_key (Supabase Storage object path) から
 * 短命の signed URL を発行する。worker (recording-download.ts) は
 * video_storage_key にしか書かないため、旧来の video_storage_url 列を
 * 読むだけでは null になり <video> が再生不可になっていた (Round2 P0 bug)。
 *
 * TTL は 5 分 (300 秒)。ページが SSR される毎に発行する。
 * 失敗 (bucket 不在 / RLS 拒否 / key 不在) は null フォールバックで
 * RecordingPlayer 側のプレースホルダ表示に任せる。
 */
async function createRecordingSignedUrl(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  storageKey: string | null,
): Promise<string | null> {
  if (!storageKey) return null;
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.recordings)
      .createSignedUrl(storageKey, 300);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

async function fetchFromSupabase(id: string): Promise<DetailViewModel | null> {
  try {
    const supabase = await createServerClient();
    const { data: rec, error } = await supabase
      .from('recordings')
      .select(
        'id,meeting_id,video_storage_url,video_storage_key,video_duration_seconds,transcript_full,transcript_segments,summary,key_points,customer_needs,objections,next_actions,commitments,sentiment_timeline,sensitivity,created_at',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !rec) return null;

    const recRow = rec as Record<string, unknown>;
    const meetingId = recRow.meeting_id as string | null;

    // recording_segments 取得 (失敗してもページは出す。jsonb fallback あり)
    let segments: TranscriptSegmentLite[] = [];
    if (recRow.id) {
      const segRes = await supabase
        .from('recording_segments')
        .select('segment_index,start_seconds,end_seconds,speaker_label,text,pii_redacted_text')
        .eq('recording_id', recRow.id as string)
        .order('segment_index', { ascending: true })
        .limit(2000);
      if (!segRes.error && Array.isArray(segRes.data)) {
        segments = segRes.data.map((s, i) => {
          const o = s as Record<string, unknown>;
          const text =
            (o.pii_redacted_text as string | undefined) ?? (o.text as string | undefined) ?? '';
          return {
            index:
              typeof o.segment_index === 'string'
                ? Number.parseInt(o.segment_index, 10)
                : ((o.segment_index as number | undefined) ?? i),
            startSec: Number.parseFloat(
              (o.start_seconds as string | number | undefined)?.toString() ?? '0',
            ),
            endSec: Number.parseFloat(
              (o.end_seconds as string | number | undefined)?.toString() ?? '0',
            ),
            speakerLabel: (o.speaker_label as string | undefined) ?? null,
            text,
          };
        });
      }
    }

    // segments が空でも、jsonb 列 (recordings.transcript_segments) を試す
    if (segments.length === 0 && Array.isArray(recRow.transcript_segments)) {
      segments = (recRow.transcript_segments as unknown[]).flatMap((v, i) => {
        if (!v || typeof v !== 'object') return [];
        const o = v as Record<string, unknown>;
        const text = (o.text as string | undefined) ?? '';
        if (!text) return [];
        return [
          {
            index:
              typeof o.index === 'number'
                ? o.index
                : typeof o.segment_index === 'number'
                  ? o.segment_index
                  : i,
            startSec:
              (o.startSec as number | undefined) ?? (o.start_seconds as number | undefined) ?? 0,
            endSec: (o.endSec as number | undefined) ?? (o.end_seconds as number | undefined) ?? 0,
            speakerLabel:
              (o.speakerLabel as string | undefined) ??
              (o.speaker_label as string | undefined) ??
              null,
            text,
          },
        ];
      });
    }

    // meeting 名 + 会社名 + owner 名 (best-effort)
    // Round1 で /meetings/page.tsx を直したのと同じパターン:
    //   meetings.contact_id → contacts.company_id → companies.name
    // meetings / contacts いずれにも `company_name` 列は存在しないため、
    // 必ず companies を引く。旧実装は `meetings.company_name` を select して
    // 常に undefined → "—" 固定だった (Round2 P0 bug)。
    let meetingTitle = '商談録画';
    let meetingCompany = '—';
    let ownerName: string | null = null;
    if (meetingId) {
      const mtgRes = await supabase
        .from('meetings')
        .select('title,contact_id,owner_user_id')
        .eq('id', meetingId)
        .maybeSingle();
      if (!mtgRes.error && mtgRes.data) {
        const m = mtgRes.data as Record<string, unknown>;
        meetingTitle = (m.title as string | undefined) ?? meetingTitle;
        const contactId = m.contact_id as string | undefined;
        const ownerId = m.owner_user_id as string | undefined;
        if (contactId) {
          const contactRes = await supabase
            .from('contacts')
            .select('company_id')
            .eq('id', contactId)
            .maybeSingle();
          const companyId = !contactRes.error
            ? ((contactRes.data as { company_id: string | null } | null)?.company_id ?? null)
            : null;
          if (companyId) {
            const companyRes = await supabase
              .from('companies')
              .select('name')
              .eq('id', companyId)
              .maybeSingle();
            if (!companyRes.error && companyRes.data) {
              meetingCompany =
                (companyRes.data as { name: string | null }).name ?? meetingCompany;
            }
          }
        }
        if (ownerId) {
          const userRes = await supabase
            .from('users')
            .select('name')
            .eq('id', ownerId)
            .maybeSingle();
          if (!userRes.error && userRes.data) {
            ownerName = (userRes.data as { name: string | null }).name ?? null;
          }
        }
      }
    }

    const durationSec = (recRow.video_duration_seconds as number | undefined) ?? 0;
    const sensitivity = (recRow.sensitivity as string | undefined) ?? 'internal';

    // 動画 URL の解決順序:
    //   1) recordings.video_storage_key (worker が書く) → 5 分 signed URL を発行
    //   2) (後方互換) recordings.video_storage_url が直接 URL を持っていれば使う
    //   3) どちらも無ければ null → RecordingPlayer がプレースホルダ表示に倒す
    const storageKey = (recRow.video_storage_key as string | undefined) ?? null;
    const signedUrl = await createRecordingSignedUrl(supabase, storageKey);
    const directUrl = (recRow.video_storage_url as string | undefined) ?? null;
    const videoUrl = signedUrl ?? directUrl;

    return {
      recordingId: recRow.id as string,
      meetingTitle,
      meetingCompany,
      ownerName,
      recordedAtIso: (recRow.created_at as string | undefined) ?? new Date().toISOString(),
      durationSec,
      videoUrl,
      posterUrl: null,
      sensitivityLabel: SENSITIVITY_LABELS[sensitivity] ?? sensitivity,
      summary: (recRow.summary as string | undefined) ?? null,
      keyPoints: toStringList(recRow.key_points),
      customerNeeds: toStringList(recRow.customer_needs),
      objections: toStringList(recRow.objections),
      transcriptSegments: segments,
      sentimentSamples: toSentimentSamples(recRow.sentiment_timeline),
      highlights: [],
      commitments: toCommitmentList(recRow.commitments, `${recRow.id}-c`),
      nextActions: toNextActionList(recRow.next_actions, `${recRow.id}-a`),
      isSample: false,
    };
  } catch {
    return null;
  }
}

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  let vm = await fetchFromSupabase(id);
  if (!vm) {
    const fixture = findRecording(id);
    if (fixture) vm = fixtureToViewModel(fixture);
  }

  if (!vm) {
    return <NotFoundView id={id} />;
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 animate-fade-in">
        <p className="kicker">№ 01 — 営業 / 録画 詳細</p>
        <span className="kicker tabular flex items-center gap-3">
          {vm.sensitivityLabel ? (
            <span
              aria-label="機密区分"
              className="px-2 h-5 inline-flex items-center rounded-full bg-card border border-border/70"
            >
              {vm.sensitivityLabel}
            </span>
          ) : null}
          {vm.isSample ? <SampleBadge /> : null}
        </span>
      </div>

      <header className="space-y-2 animate-fade-up">
        <Link
          href="/recordings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft strokeWidth={1.6} className="size-3.5" />
          録画一覧へ
        </Link>
        <h1 className="display text-2xl md:text-3xl font-semibold tracking-crisp text-balance">
          {vm.meetingTitle}
        </h1>
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{vm.meetingCompany}</span>
          {vm.ownerName ? <span>担当 {vm.ownerName}</span> : null}
          <span>・</span>
          <span className="inline-flex items-center gap-1">
            <Mic aria-hidden strokeWidth={1.6} className="size-3.5" />
            {formatDateJp(vm.recordedAtIso, true)}
          </span>
          <span>・</span>
          <span className="tabular">{formatDuration(vm.durationSec)}</span>
        </p>
      </header>

      <div className="hairline" aria-hidden />

      <RecordingDetailClient
        recordingId={vm.recordingId}
        videoUrl={vm.videoUrl}
        posterUrl={vm.posterUrl}
        durationSec={vm.durationSec}
        summary={vm.summary}
        keyPoints={vm.keyPoints}
        customerNeeds={vm.customerNeeds}
        objections={vm.objections}
        transcriptSegments={vm.transcriptSegments}
        sentimentSamples={vm.sentimentSamples}
        highlights={vm.highlights}
        commitments={vm.commitments}
        nextActions={vm.nextActions}
        editable={!vm.isSample}
      />

      {vm.isSample ? (
        <Card className="p-4 md:p-5 border-dashed border-cinnabar/35 bg-cinnabar/5">
          <p className="text-xs text-foreground/85 leading-relaxed flex items-start gap-2">
            <Sparkles
              strokeWidth={1.6}
              className="size-3.5 mt-0.5 shrink-0 text-cinnabar"
              aria-hidden
            />
            <span>
              これはデモデータです。本番接続後は Zoom 録画から自動で文字起こし ・ 要約 ・
              感情分析が並び、ここでそのまま編集 ・ 共有できます。
            </span>
          </p>
        </Card>
      ) : null}

      {/* 落款 (inkan accent) — 編集媒体の締めとして cinnabar の薄い角丸方形を 1 つ置く */}
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

/** 統一サンプルバッジ — kicker style, border-dashed cinnabar/35, bg-cinnabar/5。 */
function SampleBadge() {
  return (
    <span
      aria-label="サンプルデータ"
      className="px-2 h-5 inline-flex items-center rounded-full border border-dashed border-cinnabar/35 bg-cinnabar/5 text-cinnabar text-[10px] tracking-kicker uppercase"
    >
      サンプル
    </span>
  );
}

function NotFoundView({ id }: { id: string }) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <header className="space-y-2">
        <p className="kicker">№ 01 — 営業 / 録画 詳細</p>
        <h1 className="display text-2xl md:text-3xl font-semibold tracking-crisp">
          見つかりませんでした
        </h1>
        <p className="text-sm text-muted-foreground">
          指定された録画 ({id}) は存在しないか、閲覧権限がありません。
        </p>
      </header>
      <Link
        href="/recordings"
        className="inline-flex items-center gap-1 text-sm text-cinnabar hover:underline"
      >
        <ArrowLeft strokeWidth={1.6} className="size-4" />
        録画一覧に戻る
      </Link>
    </div>
  );
}
