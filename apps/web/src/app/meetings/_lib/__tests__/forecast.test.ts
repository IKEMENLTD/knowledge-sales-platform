// @ts-nocheck
// vitest を web 配下に持たない (apps/web の package.json は本 PR で触れない) ため
// tsc 型解決を無効化。実行は `pnpm vitest run apps/web/src/app/meetings/_lib`
// もしくは shared/worker 側の vitest プロセスで参照する想定。
import { describe, expect, it } from 'vitest';
import {
  forecastCloseDate,
  fromDemo,
  normalizeProbability,
  stageStuckDays,
  summarizePipeline,
  weightedAmount,
  weightedPipeline,
} from '../forecast';

describe('normalizeProbability', () => {
  it('null は stage の既定値を採用 (in_progress → 0.5)', () => {
    expect(normalizeProbability(null, 'in_progress')).toBe(0.5);
  });

  it('0..100 表記を 0..1 に正規化 (65 → 0.65)', () => {
    expect(normalizeProbability(65, 'in_progress')).toBeCloseTo(0.65, 6);
  });

  it('範囲外は clamp される (-0.2 → 0, 1.5 → ... 0..100 とみなされ /100 = 0.015)', () => {
    expect(normalizeProbability(-0.2, 'scheduled')).toBe(0);
    // 1.5 は >1 なので 0..100 表記とみなされ /100 = 0.015 (clamp 不要)
    expect(normalizeProbability(1.5, 'scheduled')).toBeCloseTo(0.015, 6);
    // 250 は /100 = 2.5 → clamp 1
    expect(normalizeProbability(250, 'scheduled')).toBe(1);
  });
});

describe('weightedPipeline / weightedAmount', () => {
  it('Σ amount × prob — DB null の場合 stage 既定値で重み付け', () => {
    const items = [
      // in_progress (default 0.5) × 1,000,000 = 500,000
      { id: 'a', stage: 'in_progress', amountJpy: 1_000_000, winProbability: null },
      // scheduled (default 0.25) × 2,000,000 = 500,000
      { id: 'b', stage: 'scheduled', amountJpy: 2_000_000, winProbability: null },
      // won (default 1.0) × 800,000 = 800,000
      { id: 'c', stage: 'won', amountJpy: 800_000, winProbability: null },
      // lost (default 0) × 9,000,000 = 0
      { id: 'd', stage: 'lost', amountJpy: 9_000_000, winProbability: null },
    ];
    expect(weightedPipeline(items)).toBe(1_800_000);
  });

  it('明示 winProbability (65) は stage 既定を上書き', () => {
    const m = { id: 'x', stage: 'in_progress', amountJpy: 2_500_000, winProbability: 65 };
    // 2,500,000 × 0.65 = 1,625,000 — tooltip 仕様の例
    expect(weightedAmount(m)).toBe(1_625_000);
  });

  it('空配列は 0 を返す', () => {
    expect(weightedPipeline([])).toBe(0);
  });
});

describe('forecastCloseDate', () => {
  it('月別に集計し、closeDate を scheduledAt より優先', () => {
    const items = [
      {
        id: 'a',
        stage: 'in_progress',
        amountJpy: 1_000_000,
        winProbability: 50,
        scheduledAt: '2026-05-15T10:00:00+09:00',
        closeDate: null,
      },
      {
        id: 'b',
        stage: 'scheduled',
        amountJpy: 2_000_000,
        winProbability: 25,
        scheduledAt: '2026-05-20T10:00:00+09:00',
        closeDate: null,
      },
      {
        id: 'c',
        stage: 'won',
        amountJpy: 4_000_000,
        winProbability: 100,
        scheduledAt: '2026-04-01T10:00:00+09:00',
        closeDate: '2026-06-30', // closeDate 優先 → 6 月集計に乗る
      },
    ];
    const out = forecastCloseDate(items);
    expect(out).toEqual([
      { month: '2026-05', weightedJpy: 1_000_000, count: 2 }, // 500,000 + 500,000
      { month: '2026-06', weightedJpy: 4_000_000, count: 1 },
    ]);
  });
});

describe('stageStuckDays', () => {
  it('won/lost は常に 0', () => {
    const now = new Date('2026-05-17T09:00:00+09:00');
    expect(
      stageStuckDays(
        { id: 'a', stage: 'won', amountJpy: 1, scheduledAt: '2026-01-01T00:00:00+09:00' },
        now,
      ),
    ).toBe(0);
  });

  it('進行中商談の経過日を Math.floor で計上', () => {
    const now = new Date('2026-05-17T09:00:00+09:00');
    const m = {
      id: 'a',
      stage: 'in_progress' as const,
      amountJpy: 1,
      scheduledAt: '2026-05-10T09:00:00+09:00',
    };
    expect(stageStuckDays(m, now)).toBe(7);
  });
});

describe('summarizePipeline', () => {
  it('pipelineWeighted は won/lost を除外、wonTotal は受注合計', () => {
    const items = [
      { id: 'a', stage: 'in_progress', amountJpy: 1_000_000, winProbability: 50 },
      { id: 'b', stage: 'scheduled', amountJpy: 2_000_000, winProbability: 25 },
      { id: 'c', stage: 'won', amountJpy: 3_000_000, winProbability: 100 },
      { id: 'd', stage: 'lost', amountJpy: 9_000_000, winProbability: 0 },
      { id: 'e', stage: 'on_hold', amountJpy: 500_000, winProbability: null }, // default 0.1
    ];
    const s = summarizePipeline(items);
    // 1_000_000*0.5 + 2_000_000*0.25 + 500_000*0.1 = 500_000 + 500_000 + 50_000 = 1_050_000
    expect(s.pipelineWeighted).toBe(1_050_000);
    expect(s.wonTotal).toBe(3_000_000);
    expect(s.wonWeighted).toBe(3_000_000);
    expect(s.openCount).toBe(3); // in_progress, scheduled, on_hold
    expect(s.totalCount).toBe(5);
  });
});

describe('fromDemo', () => {
  it('demo fixture を ForecastMeeting に変換 (winProbability=null で stage default に委ねる)', () => {
    const fm = fromDemo({
      id: 'demo-m-001',
      title: 't',
      companyName: 'c',
      ownerId: 'demo-u-001',
      attendeeIds: [],
      stage: 'in_progress',
      amountJpy: 1_000_000,
      scheduledAt: '2026-05-15T10:00:00+09:00',
      durationMin: 30,
      aiSummary: '',
      nextAction: '',
      commitments: [],
    });
    expect(fm.winProbability).toBeNull();
    expect(fm.amountJpy).toBe(1_000_000);
    expect(weightedAmount(fm)).toBe(500_000); // in_progress default 0.5
  });
});
