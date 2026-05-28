// apps/api/src/routes/super-admin.ts
// Super admin routes — platform-level control over organisations.
// All routes require super_admin role.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

const updateOrgStatusSchema = z.object({
  status:          z.enum(['approved', 'rejected', 'suspended', 'pending']),
  rejectionReason: z.string().max(500).optional(),
});

export const superAdminRouter = new Hono<AppEnv>();

superAdminRouter.use('*', authMiddleware);
superAdminRouter.use('*', requireSuperAdmin);

// GET /super-admin/stats — platform overview numbers
superAdminRouter.get('/stats', async (c) => {
  const [
    { count: totalOrgs },
    { count: pendingOrgs },
    { count: approvedOrgs },
    { count: totalEvents },
    { count: totalRegistrations },
  ] = await Promise.all([
    db.from('orgs').select('*', { count: 'exact', head: true }),
    db.from('orgs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('orgs').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    db.from('events').select('*', { count: 'exact', head: true }),
    db.from('registrations').select('*', { count: 'exact', head: true }),
  ]);

  return c.json({
    totalOrgs:         totalOrgs ?? 0,
    pendingOrgs:       pendingOrgs ?? 0,
    approvedOrgs:      approvedOrgs ?? 0,
    totalEvents:       totalEvents ?? 0,
    totalRegistrations: totalRegistrations ?? 0,
  });
});

// GET /super-admin/orgs — list all orgs with member + event counts
superAdminRouter.get('/orgs', async (c) => {
  const status = c.req.query('status'); // optional filter: pending|approved|rejected|suspended

  let query = db
    .from('orgs')
    .select('id, name, email, status, rejection_reason, created_at')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data: orgs, error } = await query;
  if (error) return c.json({ error: 'Failed to fetch orgs' }, 500);

  // Enrich with counts
  const enriched = await Promise.all(
    (orgs ?? []).map(async (org) => {
      const [{ count: memberCount }, { count: eventCount }] = await Promise.all([
        db.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
        db.from('events').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
      ]);
      return { ...org, member_count: memberCount ?? 0, event_count: eventCount ?? 0 };
    })
  );

  return c.json(enriched);
});

// GET /super-admin/orgs/:id — full org detail with per-event counts
superAdminRouter.get('/orgs/:id', async (c) => {
  const { id } = c.req.param();

  const { data: org, error } = await db
    .from('orgs')
    .select('id, name, email, status, rejection_reason, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) return c.json({ error: 'Failed to fetch org' }, 500);
  if (!org) return c.json({ error: 'Organisation not found' }, 404);

  const [{ data: members }, { data: events }] = await Promise.all([
    db.from('org_members')
      .select('id, user_id, role, status, created_at, users(name, email)')
      .eq('org_id', id)
      .order('created_at', { ascending: true }),
    db.from('events')
      .select('id, name, slug, description, date, location, is_active, created_at')
      .eq('org_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const flatMembers = (members ?? []).map((m: any) => ({
    id: m.id, user_id: m.user_id, name: m.users?.name ?? '', email: m.users?.email ?? '',
    role: m.role, status: m.status, created_at: m.created_at,
  }));

  // Per-event registration counts
  const enrichedEvents = await Promise.all(
    (events ?? []).map(async (ev: any) => {
      const [{ count: total }, { count: checkedIn }] = await Promise.all([
        db.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
        db.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('status', 'approved'),
      ]);
      return { ...ev, registration_count: total ?? 0, checkin_count: checkedIn ?? 0 };
    })
  );

  const totalRegs = enrichedEvents.reduce((s: number, e: any) => s + e.registration_count, 0);

  return c.json({
    org,
    members: flatMembers,
    events:  enrichedEvents,
    registration_count: totalRegs,
  });
});

// GET /super-admin/events/:eventId/registrations — all registrants for an event
superAdminRouter.get('/events/:eventId/registrations', async (c) => {
  const { eventId } = c.req.param();

  const { data: event } = await db
    .from('events').select('id, name, org_id').eq('id', eventId).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const { data: registrations, error } = await db
    .from('registrations')
    .select('id, name, surname, email, mobile, state, city, profession, other_info, unique_code, status, registered_at')
    .eq('event_id', eventId)
    .order('registered_at', { ascending: false });

  if (error) return c.json({ error: 'Failed to fetch registrations' }, 500);
  return c.json(registrations ?? []);
});

// PATCH /super-admin/orgs/:id/status — approve, reject, suspend
superAdminRouter.patch(
  '/orgs/:id/status',
  zValidator('json', updateOrgStatusSchema),
  async (c) => {
    const { id } = c.req.param();
    const { status, rejectionReason } = c.req.valid('json');

    const updatePayload: Record<string, unknown> = { status };
    if (status === 'rejected' && rejectionReason) {
      updatePayload.rejection_reason = rejectionReason;
    } else {
      updatePayload.rejection_reason = null; // clear on approve/suspend
    }

    const { data: org, error } = await db
      .from('orgs')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, email, status, rejection_reason')
      .maybeSingle();

    if (error || !org) return c.json({ error: 'Failed to update org status' }, 500);

    return c.json(org);
  }
);

// PATCH /super-admin/password — change super admin password (bcrypt)
superAdminRouter.patch(
  '/password',
  zValidator('json', z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(8).max(128),
  })),
  async (c) => {
    const user = c.get('user');
    const { currentPassword, newPassword } = c.req.valid('json');

    const { data: sa } = await db
      .from('super_admins')
      .select('password_hash')
      .eq('id', user.sub)
      .maybeSingle();

    if (!sa) return c.json({ error: 'Account not found' }, 404);

    const bcrypt = await import('bcryptjs');
    const valid  = await bcrypt.compare(currentPassword, sa.password_hash);
    if (!valid) return c.json({ error: 'Current password is incorrect' }, 400);

    const newHash = await bcrypt.hash(newPassword, 12);
    const { error } = await db.from('super_admins').update({ password_hash: newHash }).eq('id', user.sub);
    if (error) return c.json({ error: 'Failed to update password' }, 500);

    return c.json({ ok: true });
  }
);

