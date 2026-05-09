import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus メトリクスレジストリ。
 *
 * 23_observability_alerts P1 で要求される観測項目:
 *   - jobs_processed_total: ジョブ処理量 (キュー別 / status別)
 *   - job_duration_seconds: ジョブ処理時間 histogram
 *   - pgmq_queue_depth: pgmq の積み残し
 *   - llm_tokens_total / llm_cost_usd_total: LLM rate / cost watch
 *
 * `/metrics` エンドポイントで scrape させる。
 */
export const registry = new Registry();

// Node.js 標準メトリクス (CPU/MEM/event loop lag) を自動収集。
collectDefaultMetrics({ register: registry });

export const jobsProcessedTotal = new Counter({
  name: 'jobs_processed_total',
  help: 'Total number of pgmq jobs processed by the worker',
  labelNames: ['queue', 'status'] as const,
  registers: [registry],
});

export const jobDurationSeconds = new Histogram({
  name: 'job_duration_seconds',
  help: 'Duration of pgmq job processing in seconds',
  labelNames: ['queue', 'status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300, 600],
  registers: [registry],
});

export const pgmqQueueDepth = new Gauge({
  name: 'pgmq_queue_depth',
  help: 'Current pgmq queue depth (visible + invisible)',
  labelNames: ['queue'] as const,
  registers: [registry],
});

export const llmTokensTotal = new Counter({
  name: 'llm_tokens_total',
  help: 'Total LLM tokens consumed',
  labelNames: ['vendor', 'model', 'kind'] as const, // kind: input | output
  registers: [registry],
});

export const llmCostUsdTotal = new Counter({
  name: 'llm_cost_usd_total',
  help: 'Total LLM cost in USD',
  labelNames: ['vendor', 'model'] as const,
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled by the worker',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

/**
 * Prometheus テキストフォーマットの出力。
 */
export async function renderMetrics(): Promise<{ contentType: string; body: string }> {
  return {
    contentType: registry.contentType,
    body: await registry.metrics(),
  };
}
