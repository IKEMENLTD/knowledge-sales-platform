import { COST_CAPS } from '@ksp/shared';
import { logger } from './logger.js';
import { captureMessage } from './sentry.js';

/**
 * 12_cost_estimate v2.2 の per-conversation / per-meeting cost cap を
 * worker 側 LLM パイプラインで強制する kill switch。
 *
 * 上限超過時:
 *   - logger.warn で構造化ログを残し
 *   - Sentry に warning として送信
 *   - 呼び出し元に Error('CONVERSATION_COST_CAP_EXCEEDED' / 'MEETING_COST_CAP_EXCEEDED') を throw
 *
 * Slack 通知は Sentry alert ルール側で発火させる前提だが、
 * SLACK_ALERT_WEBHOOK_URL を直接叩く実装は TODO (P1.5)。
 */

export class CostCapExceededError extends Error {
  override readonly name = 'CostCapExceededError';
  constructor(
    public readonly code: 'CONVERSATION_COST_CAP_EXCEEDED' | 'MEETING_COST_CAP_EXCEEDED',
    public readonly cap: number,
    public readonly spendUsd: number,
    public readonly context: Record<string, unknown>,
  ) {
    super(code);
  }
}

export function assertConversationCap(args: {
  meetingId: string;
  conversationId?: string;
  spendUsd: number;
}): void {
  const { meetingId, conversationId, spendUsd } = args;
  if (spendUsd > COST_CAPS.perConversationUsd) {
    const ctx = { meetingId, conversationId, spendUsd, cap: COST_CAPS.perConversationUsd };
    logger.warn(ctx, 'conversation cost cap exceeded');
    captureMessage('CONVERSATION_COST_CAP_EXCEEDED', 'warning');
    // TODO(P1.5): Slack 直送 (SLACK_ALERT_WEBHOOK_URL) を `lib/slack.ts` 経由で実装する。
    throw new CostCapExceededError(
      'CONVERSATION_COST_CAP_EXCEEDED',
      COST_CAPS.perConversationUsd,
      spendUsd,
      ctx,
    );
  }
}

export function assertMeetingCap(args: { meetingId: string; spendUsd: number }): void {
  const { meetingId, spendUsd } = args;
  if (spendUsd > COST_CAPS.perMeetingUsd) {
    const ctx = { meetingId, spendUsd, cap: COST_CAPS.perMeetingUsd };
    logger.warn(ctx, 'meeting cost cap exceeded');
    captureMessage('MEETING_COST_CAP_EXCEEDED', 'warning');
    // TODO(P1.5): Slack 直送
    throw new CostCapExceededError(
      'MEETING_COST_CAP_EXCEEDED',
      COST_CAPS.perMeetingUsd,
      spendUsd,
      ctx,
    );
  }
}
