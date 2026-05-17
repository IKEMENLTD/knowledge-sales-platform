'use client';

import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PlayerController } from './recording-player';

/**
 * 感情曲線チャート。
 *
 * - recharts LineChart で `sentiment_timeline` を時系列描画
 * - クリック (Line / Dot) → controller.seekTo(atSec) で動画ジャンプ
 * - 既存 sparkline (recordings/page.tsx) と意匠を合わせるため
 *   stroke=cinnabar、薄い fill、grid は控えめ
 * - 値域 -1..+1 を 0..100 に視覚化 (上に向かうほど positive)
 *
 * a11y:
 *  - role=img + aria-label で要約を読み上げ
 *  - 純数値テーブルは下に sr-only で添える
 */

export type SentimentPoint = {
  atSec: number;
  value: number; // -1..+1
  speakerLabel?: string | null;
};

export interface SentimentChartProps {
  samples: SentimentPoint[];
  /** 現在再生中の秒数。垂直 ReferenceLine で示す */
  currentSec: number;
  controllerRef: React.RefObject<PlayerController | null>;
  /** 全体動画長 (X 軸 max を明示するため) */
  durationSec: number;
}

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SentimentChart({
  samples,
  currentSec,
  controllerRef,
  durationSec,
}: SentimentChartProps) {
  const data = useMemo(
    () =>
      samples
        .slice()
        .sort((a, b) => a.atSec - b.atSec)
        .map((s) => ({
          atSec: s.atSec,
          // 値を 0..100 へ正規化 (sparkline と意匠合わせ)
          value: Math.round(((s.value + 1) / 2) * 100),
          rawValue: s.value,
          speaker: s.speakerLabel ?? null,
        })),
    [samples],
  );

  const summary = useMemo(() => {
    if (data.length === 0) return '感情データなし';
    const head = data[0];
    if (!head) return '感情データなし';
    const avg = data.reduce((sum, d) => sum + d.value, 0) / data.length;
    const peak = data.reduce((max, d) => (d.value > max.value ? d : max), head);
    const trough = data.reduce((min, d) => (d.value < min.value ? d : min), head);
    return `平均 ${Math.round(avg)} ・ ピーク ${peak.value} @ ${formatTs(peak.atSec)} ・ 底 ${trough.value} @ ${formatTs(trough.atSec)}`;
  }, [data]);

  if (data.length === 0) {
    return <div className="text-xs text-muted-foreground py-4">感情データはまだありません。</div>;
  }

  return (
    <div className="space-y-2">
      <header className="flex items-baseline justify-between gap-3">
        <p className="kicker">感情の流れ</p>
        <span className="kicker tabular text-muted-foreground">{summary}</span>
      </header>
      <div
        role="img"
        aria-label={`感情の流れ。${summary}`}
        className={cn(
          'h-44 w-full rounded-lg border border-border/60 bg-card/40 p-3',
          'shadow-sumi-sm',
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
            onClick={(state) => {
              // recharts のクリックは activePayload に集まる
              const payload = state?.activePayload?.[0]?.payload as { atSec: number } | undefined;
              if (payload && Number.isFinite(payload.atSec)) {
                controllerRef.current?.seekTo(payload.atSec);
              }
            }}
          >
            <defs>
              <linearGradient id="sentiment-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--cinnabar))" stopOpacity="0.35" />
                <stop offset="100%" stopColor="hsl(var(--cinnabar))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="atSec"
              type="number"
              domain={[0, Math.max(durationSec, data[data.length - 1]?.atSec ?? 0)]}
              tickFormatter={formatTs}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--cinnabar))', strokeOpacity: 0.4, strokeWidth: 1 }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
                padding: '6px 10px',
              }}
              labelFormatter={(v) => `時刻 ${formatTs(Number(v))}`}
              formatter={(v) => [`${v}`, '感情スコア']}
            />
            {Number.isFinite(currentSec) && currentSec >= 0 ? (
              <ReferenceLine
                x={currentSec}
                stroke="hsl(var(--cinnabar))"
                strokeOpacity={0.6}
                strokeWidth={1.5}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--cinnabar))"
              strokeWidth={1.8}
              dot={{ r: 2, fill: 'hsl(var(--cinnabar))' }}
              activeDot={{
                r: 5,
                fill: 'hsl(var(--cinnabar))',
                stroke: 'hsl(var(--background))',
                strokeWidth: 2,
                cursor: 'pointer',
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-muted-foreground">
        点をクリックすると、その時刻まで動画がジャンプします。
      </p>
      {/* sr-only テーブル */}
      <table className="sr-only">
        <caption>感情の流れの数値一覧</caption>
        <thead>
          <tr>
            <th scope="col">時刻 (秒)</th>
            <th scope="col">スコア (0-100)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.atSec}>
              <td>{d.atSec}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
