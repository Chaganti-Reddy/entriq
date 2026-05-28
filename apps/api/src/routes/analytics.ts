// apps/api/src/routes/analytics.ts
// Analytics route — aggregated stats for an event dashboard.
// Protected: only the owning org can see analytics.

import { Hono } from 'hono';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

export const analyticsRouter = new Hono<AppEnv>();

analyticsRouter.use('*', authMiddleware);
analyticsRouter.use('*', requireRole('co_organizer', 'admin'));

// GET /analytics/:eventId
analyticsRouter.get('/:eventId', async (c) => {
  const user = c.get('user');
  const { eventId } = c.req.param();

  // Verify ownership
  const { data: event } = await db
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  // Parallel: total registrations, approved, recent checkins
  const [
    { count: total },
    { count: approved },
    { data: recentCheckins },
  ] = await Promise.all([
    db
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId),
    db
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'approved'),
    db
      .from('checkins')
      .select('id, approved_at, approved_by, registrations(name, surname, email)')
      .eq('event_id', eventId)
      .order('approved_at', { ascending: false })
      .limit(10),
  ]);

  return c.json({
    total: total ?? 0,
    approved: approved ?? 0,
    pending: (total ?? 0) - (approved ?? 0),
    recentCheckins: recentCheckins ?? [],
  });
});
