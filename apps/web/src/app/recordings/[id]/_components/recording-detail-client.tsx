'use client';

import { Card } from '@/components/ui/card';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AiInsightsPanel } from './ai-insights-panel';
import { type CommitmentItem, CommitmentsPanel, type NextActionItem } from './commitments-panel';
import { type PlayerController, RecordingPlayer, buildSpeakerColorMap } from './recording-player';
import { SentimentChart, type SentimentPoint } from './sentiment-chart';
import { ShareLinkDialog } from './share-link-dialog';
import { TranscriptPane, type TranscriptSegmentLite } from './transcript-pane';

/**
 * 録画詳細画面の Client 側全体。
 *
 * 時刻同期パターン:
 *  - `<RecordingPlayer />` は ref controller (seekTo / play / pause / toggle) を露出
 *  - 同 component は再生中 `onTimeUpdate(sec)` を 200ms 単位で間引いて発火
 *  - 本 Client が `currentSec` state を保持し、
 *    transcript-pane / sentiment-chart / share-link-dialog に props として配る
 *  - 逆方向 (transcript / chart / commitments / chapters クリック) は
 *    `controllerRef.current?.seekTo(sec)` を呼ぶことで動画位置を動かす。
 *    動画側 `timeupdate` がそのまま `currentSec` に流れるため、ループは無い。
 *
 * 編集系の onSectionSave 等は本ファイル内では fetch せず、まずは local state を
 * 更新するに留める (PATCH /api/recordings は別 agent)。
 */
export interface RecordingDetailClientProps {
  recordingId: string;
  videoUrl: string | null;
  posterUrl: string | null;
  durationSec: number;
  summary: string | null;
  keyPoints: string[];
  customerNeeds: string[];
  objections: string[];
  transcriptSegments: TranscriptSegmentLite[];
  sentimentSamples: SentimentPoint[];
  highlights: { atSec: number; label: string }[];
  commitments: CommitmentItem[];
  nextActions: NextActionItem[];
  editable: boolean;
}

export function RecordingDetailClient({
  recordingId,
  videoUrl,
  posterUrl,
  durationSec,
  summary,
  keyPoints,
  customerNeeds,
  objections,
  transcriptSegments,
  sentimentSamples,
  highlights,
  commitments,
  nextActions,
  editable,
}: RecordingDetailClientProps) {
  const controllerRef = useRef<PlayerController | null>(null);
  const [currentSec, setCurrentSec] = useState(0);

  // ローカル編集 state (PATCH は別途。UI 表示は楽観更新)
  const [localSummary, setLocalSummary] = useState(summary);
  const [localKeyPoints, setLocalKeyPoints] = useState(keyPoints);
  const [localCustomerNeeds, setLocalCustomerNeeds] = useState(customerNeeds);
  const [localObjections, setLocalObjections] = useState(objections);
  const [handoffReady, setHandoffReady] = useState(false);

  // 話者カラーマップ (transcript_segments + 既存 speaker_label の union)
  const speakerColors = useMemo(() => {
    const labels: string[] = [];
    for (const s of transcriptSegments) {
      if (s.speakerLabel) labels.push(s.speakerLabel);
    }
    return buildSpeakerColorMap(labels);
  }, [transcriptSegments]);

  const handleTimeUpdate = useCallback((sec: number) => {
    setCurrentSec(sec);
  }, []);

  const handleSectionSave = useCallback(
    async (
      key: Parameters<
        NonNullable<React.ComponentProps<typeof AiInsightsPanel>['onSectionSave']>
      >[0],
      next: string | string[],
    ) => {
      // 楽観更新のみ。API 接続は将来。
      if (key === 'summary' && typeof next === 'string') setLocalSummary(next);
      if (key === 'keyPoints' && Array.isArray(next)) setLocalKeyPoints(next);
      if (key === 'customerNeeds' && Array.isArray(next)) setLocalCustomerNeeds(next);
      if (key === 'objections' && Array.isArray(next)) setLocalObjections(next);
    },
    [],
  );

  const handleSpeakerRename = useCallback((_old: string, _next: string) => {
    // PATCH /api/recordings/[id]/speakers — 別 agent。
    // 失敗しても UI は transcript-pane 内 state で更新済。
  }, []);

  const handleAllDone = useCallback(() => {
    setHandoffReady(true);
    // POST /api/notifications/handoff-pending (別 agent) を将来ここから叩く。
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-8">
      {/* 左カラム: プレイヤー + 感情チャート + 文字起こし */}
      <div className="space-y-6 min-w-0">
        <Card className="p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="kicker">№ 02 — 再生</p>
            <ShareLinkDialog
              recordingId={recordingId}
              durationSec={durationSec}
              initialStartSec={currentSec}
            />
          </div>
          <RecordingPlayer
            ref={controllerRef}
            videoUrl={videoUrl}
            posterUrl={posterUrl}
            durationSec={durationSec}
            chapters={highlights}
            onTimeUpdate={handleTimeUpdate}
          />
        </Card>

        <Card className="p-4 md:p-5 space-y-3">
          <p className="kicker">№ 03 — 感情の起伏</p>
          <SentimentChart
            samples={sentimentSamples}
            currentSec={currentSec}
            controllerRef={controllerRef}
            durationSec={durationSec}
          />
        </Card>

        <Card className="p-4 md:p-5 space-y-3">
          <p className="kicker">№ 04 — 発言録</p>
          <TranscriptPane
            segments={transcriptSegments}
            currentSec={currentSec}
            controllerRef={controllerRef}
            speakerColors={speakerColors}
            onSpeakerRename={handleSpeakerRename}
          />
        </Card>
      </div>

      {/* 右カラム: AI インサイト + 約束/次のアクション */}
      <aside className="space-y-6 min-w-0">
        <div className="space-y-3">
          <p className="kicker">№ 05 — AI 解析</p>
          <AiInsightsPanel
            recordingId={recordingId}
            summary={localSummary}
            keyPoints={localKeyPoints}
            customerNeeds={localCustomerNeeds}
            objections={localObjections}
            editable={editable}
            onSectionSave={handleSectionSave}
          />
        </div>
        <div className="space-y-3">
          <p className="kicker">№ 06 — 約束と次のアクション</p>
          <CommitmentsPanel
            commitments={commitments}
            nextActions={nextActions}
            controllerRef={controllerRef}
            onAllDone={handleAllDone}
          />
        </div>
        {handoffReady ? (
          <output className="block text-xs text-chitose border-l-2 border-chitose pl-3 leading-relaxed">
            ぜんぶ完了しました。CS への引き継ぎ通知を準備しました (本番接続後に自動送信されます)。
          </output>
        ) : null}
      </aside>
    </div>
  );
}
