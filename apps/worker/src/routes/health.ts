import { Hono } from 'hono';

export const health = new Hono();

health.get('/healthz', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));
health.get('/readyz', (c) => c.json({ status: 'ready' }));
