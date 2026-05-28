// apps/api/src/worker.ts
// Cloudflare Workers entry point.
// Identical to index.ts but uses CF Workers export format instead of @hono/node-server.
// Local dev: use `pnpm dev` (tsx watch src/index.ts)
// CF deploy:  use `pnpm deploy:cf`

import type { ExecutionContext } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { prettyJSON } from 'hono/pretty-json';
import { setCFEnv, getEnv } from './lib/env.js';
import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { registrationsRouter } from './routes/registrations.js';
import { checkinRouter } from './routes/checkins.js';
import { analyticsRouter } from './routes/analytics.js';
import { membersRouter } from './routes/members.js';
import { superAdminRouter } from './routes/super-admin.js';
import { userRouter } from './routes/user.js';

const app = new Hono();

app.use('*', secureHeaders());
app.use('*', logger());

app.use('*', cors({
  origin: (origin, c) => {
    // No origin = server-to-server or same-origin — allow
    if (!origin) return origin;

    const frontendUrl = (c.env as Record<string, string>)?.FRONTEND_URL
      ?? process.env.FRONTEND_URL ?? '';

    const allowed = new Set([
      'http://localhost:3000',
      'http://localhost:3001',
      ...(frontendUrl ? [frontendUrl] : []),
    ]);

    if (allowed.has(origin)) return origin;

    // Allow any Vercel preview/production deployment for this project
    if (/^https:\/\/entriq[a-z0-9-]*\.vercel\.app$/.test(origin)) return origin;

    return null;
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
  credentials: true,
}));

app.route('/auth', authRouter);
app.route('/events', eventsRouter);
app.route('/registrations', registrationsRouter);
app.route('/checkin', checkinRouter);
app.route('/analytics', analyticsRouter);
app.route('/members', membersRouter);
app.route('/super-admin', superAdminRouter);
app.route('/user', userRouter);

app.get('/health', (c: any) =>
  c.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() })
);

// Temporary debug endpoint — remove after confirming env vars are injected
app.get('/debug/env', (c: any) => {
  const e = c.env ?? {};
  return c.json({
    via_getEnv: {
      has_supabase_url:     !!getEnv('SUPABASE_URL'),
      has_service_role_key: !!getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      has_anon_key:         !!getEnv('SUPABASE_ANON_KEY'),
      has_jwt_secret:       !!getEnv('JWT_SECRET'),
      has_jwt_refresh:      !!getEnv('JWT_REFRESH_SECRET'),
    },
    via_c_env: {
      has_supabase_url:     !!e.SUPABASE_URL,
      has_service_role_key: !!e.SUPABASE_SERVICE_ROLE_KEY,
      has_anon_key:         !!e.SUPABASE_ANON_KEY,
      has_jwt_secret:       !!e.JWT_SECRET,
      has_jwt_refresh:      !!e.JWT_REFRESH_SECRET,
    },
    node_env:        getEnv('NODE_ENV'),
    frontend_url:    !!getEnv('FRONTEND_URL'),
    enumerable_keys: Object.keys(e),
  });
});

app.notFound((c: any) => c.json({ error: 'Route not found' }, 404));

app.onError((err: any, c: any) => {
  console.error('[unhandled error]', err);
  // Temporary: return real error message for debugging
  return c.json({ error: err?.message ?? String(err), stack: err?.stack?.split('\n').slice(0,3) }, 500);
});

// ─── Cloudflare Workers export ────────────────────────────────────────────────
// CF Workers passes env bindings via the `env` parameter on every request.
// We copy them into process.env so all existing route handlers work unchanged.

export default {
  fetch(request: Request, env: Record<string, string>, ctx: ExecutionContext) {
    // Inject CF bindings on every request — process.env doesn't get CF secrets
    setCFEnv(env);
    return app.fetch(request, env, ctx);
  },
};
