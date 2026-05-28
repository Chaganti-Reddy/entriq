// apps/api/src/index.ts
// Hono.js application entry point.
// Sets up middleware, routes, error handling, and starts the server.

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { prettyJSON } from 'hono/pretty-json';
import { db } from './services/db.js';
import bcrypt from 'bcryptjs';
import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { registrationsRouter } from './routes/registrations.js';
import { checkinRouter } from './routes/checkins.js';
import { analyticsRouter } from './routes/analytics.js';
import { membersRouter } from './routes/members.js';
import { superAdminRouter } from './routes/super-admin.js';

import { userRouter } from './routes/user.js';

const app = new Hono();

// ─── Global Middleware ────────────────────────────────────────────────────────

// Security headers (CSP, HSTS, etc.)
app.use('*', secureHeaders());

// Request logging
app.use('*', logger());

// CORS — only allow the frontend origin
const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigin; // server-to-server
      if (origin === allowedOrigin) return origin;
      if (process.env.NODE_ENV === 'development') return origin; // allow all in dev
      return null; // reject
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,
    credentials: true,
  })
);

// Pretty JSON in development
if (process.env.NODE_ENV !== 'production') {
  app.use('*', prettyJSON());
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route('/auth', authRouter);
app.route('/events', eventsRouter);
app.route('/registrations', registrationsRouter);
app.route('/checkin', checkinRouter);
app.route('/analytics', analyticsRouter);
app.route('/members', membersRouter);
app.route('/super-admin', superAdminRouter);
app.route('/user', userRouter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'unknown',
  })
);

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Route not found' }, 404));

// ─── Global error handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error('[unhandled error]', err);
  return c.json(
    { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message },
    500
  );
});

// ─── Start server ─────────────────────────────────────────────────────────────

async function seedSuperAdmin() {
  const email    = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('⚠️  SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping seed');
    return;
  }

  const { count } = await db
    .from('super_admins')
    .select('*', { count: 'exact', head: true });

  if ((count ?? 0) === 0) {
    const passwordHash = await bcrypt.hash(password, 12);
    const { error } = await db
      .from('super_admins')
      .insert({ email: email.toLowerCase(), password_hash: passwordHash, name: 'Super Admin' });
    if (error) {
      console.error('❌ Failed to seed super admin:', error.message);
    } else {
      console.log(`✅ Super admin seeded: ${email}`);
    }
  }
}

const port = parseInt(process.env.PORT ?? '3001', 10);

serve({ fetch: app.fetch, port }, async (info) => {
  console.log(`\n🚀 Entriq API running on http://localhost:${info.port}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   Frontend:    ${process.env.FRONTEND_URL ?? 'http://localhost:3000'}\n`);
  await seedSuperAdmin();
});
