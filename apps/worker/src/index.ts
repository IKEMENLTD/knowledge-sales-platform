import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { health } from '@/routes/health';
import { webhooks } from '@/routes/webhooks';

const app = new Hono();

app.use('*', honoLogger((msg) => logger.info(msg)));

app.route('/', health);
app.route('/', webhooks);

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

app.onError((err, c) => {
  logger.error({ err, path: c.req.path }, 'unhandled worker error');
  return c.json({ error: 'internal_error' }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'worker listening');
});
