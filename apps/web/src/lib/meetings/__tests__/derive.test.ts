import { describe, expect, it } from 'vitest';
import { computeWinProbability, validateStageTransition } from '../derive';

describe('computeWinProbability', () => {
  it('won → 1.0 (lostReason は無視)', () => {
    expect(computeWinProbability('negotiation', 'won', null)).toBe(1);
    expect(computeWinProbability('first', 'won', '関係なし')).toBe(1);
  });

  it('lost → 0.0 (lostReason の値は影響しない)', () => {
    expect(computeWinProbability('negotiation', 'lost', null)).toBe(0);
    expect(computeWinProbability('demo', 'lost', '予算不足')).toBe(0);
  });

  it('on_hold は stage 既定の半分', () => {
    // negotiation: 0.6 → 0.3
    expect(computeWinProbability('negotiation', 'on_hold', null)).toBe(0.3);
    // first: 0.1 → 0.05
    expect(computeWinProbability('first', 'on_hold', null)).toBe(0.05);
  });

  it('open + 各 stage で既定値を返す (境界 first / closing)', () => {
    expect(computeWinProbability('first', 'open', null)).toBe(0.1);
    expect(computeWinProbability('closing', 'open', null)).toBe(0.8);
  });

  it('open + proposal で 0.45', () => {
    expect(computeWinProbability('proposal', 'open', null)).toBe(0.45);
  });

  it('dealStatus 未指定 (undefined) は stage 既定値', () => {
    expect(computeWinProbability('demo', undefined, null)).toBe(0.3);
    expect(computeWinProbability('demo', null, null)).toBe(0.3);
  });

  it('stage 未指定 (リード) は 0.05 fallback', () => {
    expect(computeWinProbability(null, 'open', null)).toBe(0.05);
    expect(computeWinProbability(undefined, null, null)).toBe(0.05);
  });

  it('CS フェーズ kickoff / cs_regular は 1.0、cs_issue は 0.9', () => {
    expect(computeWinProbability('kickoff', 'open', null)).toBe(1);
    expect(computeWinProbability('cs_regular', 'open', null)).toBe(1);
    expect(computeWinProbability('cs_issue', 'open', null)).toBe(0.9);
  });
});

describe('validateStageTransition', () => {
  it('同じ stage は noop', () => {
    expect(validateStageTransition('demo', 'demo')).toEqual({ kind: 'noop' });
  });

  it('初回 stage 設定 (from null/undefined) は ok', () => {
    expect(validateStageTransition(null, 'first')).toEqual({ kind: 'ok' });
    expect(validateStageTransition(undefined, 'demo')).toEqual({ kind: 'ok' });
  });

  it('セールス順方向 (first → negotiation) は ok', () => {
    expect(validateStageTransition('first', 'negotiation')).toEqual({ kind: 'ok' });
    expect(validateStageTransition('demo', 'closing')).toEqual({ kind: 'ok' });
  });

  it('セールス逆走 (negotiation → demo) は warning', () => {
    const v = validateStageTransition('negotiation', 'demo');
    expect(v.kind).toBe('warning');
    if (v.kind === 'warning') {
      expect(v.reason).toContain('sales_stage_regression');
    }
  });

  it('closing → kickoff (受注後 CS 移行) は ok', () => {
    expect(validateStageTransition('closing', 'kickoff')).toEqual({ kind: 'ok' });
  });

  it('CS → セールス (kickoff → first) は post_contract_to_pre_contract warning', () => {
    const v = validateStageTransition('kickoff', 'first');
    expect(v.kind).toBe('warning');
    if (v.kind === 'warning') {
      expect(v.reason).toContain('post_contract_to_pre_contract');
    }
  });

  it('cs_issue → cs_regular は ok (CS 内遷移)', () => {
    expect(validateStageTransition('cs_issue', 'cs_regular')).toEqual({ kind: 'ok' });
  });
});
