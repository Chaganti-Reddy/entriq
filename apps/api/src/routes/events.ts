// apps/api/src/routes/events.ts
// Event CRUD — admin only (create/edit/delete). Co-organizers can read.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireEventAccess } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

// ─── Validation schemas ────────────────────────────────────────────────────────

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createEventSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  location: z.string().max(300).trim().optional(),
  slug: z.string().min(3).max(100).regex(slugRegex, 'Slug must be lowercase alphanumeric with hyphens'),
  adminPassword: z.string().min(6).max(100),
});

const updateEventSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  location: z.string().max(300).trim().optional(),
  slug: z.string().min(3).max(100).regex(slugRegex).optional(),
  adminPassword: z.string().min(6).max(100).optional(),
  isActive: z.boolean().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const eventsRouter = new Hono<AppEnv>();

// ── PUBLIC routes (no auth) — must be registered BEFORE the auth middleware ──

// GET /events/slug-check/:slug — check if a slug is available (used by create-event form)
eventsRouter.get('/slug-check/:slug', async (c) => {
  const { slug } = c.req.param();
  const { data } = await db.from('events').select('id').eq('slug', slug).maybeSingle();
  return c.json({ available: !data });
});

// GET /events/public/:slug — get event info for the public registration form
eventsRouter.get('/public/:slug', async (c) => {
  const { slug } = c.req.param();

  const { data: event, error } = await db
    .from('events')
    .select('id, name, date, location, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return c.json({ error: 'Failed to fetch event' }, 500);
  if (!event) return c.json({ error: 'Event not found' }, 404);

  return c.json(event);
});

// ── PROTECTED routes — auth middleware applies to everything below ────────────

eventsRouter.use('*', authMiddleware);
// GET routes: both admin + co_organizer can read
// Write routes (POST/PUT/DELETE): per-route override to admin-only (see below)

// GET /events — list events for the logged-in org
// Admins: all events. Co-organizers: only events they are assigned to via event_members.
eventsRouter.get('/', requireRole('co_organizer', 'admin'), async (c) => {
  const user = c.get('user');

  let eventIds: string[] | null = null;

  // Co-organizers are scoped to their assigned events
  if (user.role === 'co_organizer') {
    const { data: assignments } = await db
      .from('event_members')
      .select('event_id')
      .eq('user_id', user.sub)
      .eq('org_id', user.orgId!);

    eventIds = (assignments ?? []).map((a) => a.event_id);
    // If not assigned to any event, return empty
    if (eventIds.length === 0) return c.json([]);
  }

  let query = db
    .from('events')
    .select('*')
    .eq('org_id', user.orgId!)
    .order('created_at', { ascending: false });

  if (eventIds !== null) query = query.in('id', eventIds);

  const { data: events, error } = await query;

  if (error) {
    console.error('[events/list]', error);
    return c.json({ error: 'Failed to fetch events' }, 500);
  }

  // Fetch registration + checkin counts for each event
  const enriched = await Promise.all(
    (events ?? []).map(async (event) => {
      const [{ count: regCount }, { count: checkinCount }] = await Promise.all([
        db.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', event.id),
        db.from('checkins').select('*', { count: 'exact', head: true }).eq('event_id', event.id),
      ]);

      // Strip admin_password from response
      const { admin_password: _, ...safeEvent } = event;
      return {
        ...safeEvent,
        registration_count: regCount ?? 0,
        checkin_count: checkinCount ?? 0,
      };
    })
  );

  return c.json(enriched);
});

// POST /events — create a new event (admin only)
eventsRouter.post('/', requireRole('admin'), zValidator('json', createEventSchema), async (c) => {
  const user = c.get('user');
  const { name, description, date, location, slug, adminPassword } = c.req.valid('json');

  // Check slug uniqueness
  const { data: existing } = await db
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return c.json({ error: 'This URL slug is already taken' }, 409);
  }

  // Hash the gate password — stored hashed, compared with bcrypt.compare on checkin.
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const { data: event, error } = await db
    .from('events')
    .insert({
      org_id: user.orgId!,
      name,
      description: description ?? null,
      date: date ?? null,
      location: location ?? null,
      slug,
      admin_password: adminPasswordHash,
      is_active: true,
    })
    .select('id, org_id, name, description, date, location, slug, is_active, created_at')
    .single();

  if (error || !event) {
    console.error('[events/create]', error);
    return c.json({ error: 'Failed to create event' }, 500);
  }

  return c.json(event, 201);
});

// GET /events/:id — get single event with counts
// Co-organizers: must be assigned in event_members.
eventsRouter.get('/:id', requireRole('co_organizer', 'admin'), requireEventAccess, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const { data: event, error } = await db
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('org_id', user.orgId!) // scope to org — prevents IDOR
    .maybeSingle();

  if (error) {
    return c.json({ error: 'Failed to fetch event' }, 500);
  }
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const [{ count: regCount }, { count: checkinCount }] = await Promise.all([
    db.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', id),
    db.from('checkins').select('*', { count: 'exact', head: true }).eq('event_id', id),
  ]);

  const { admin_password: _, ...safeEvent } = event;
  return c.json({
    ...safeEvent,
    registration_count: regCount ?? 0,
    checkin_count: checkinCount ?? 0,
  });
});

// PUT /events/:id — update event fields (admin only)
eventsRouter.put('/:id', requireRole('admin'), zValidator('json', updateEventSchema), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const body = c.req.valid('json');

  // Verify ownership
  const { data: existing } = await db
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!existing) {
    return c.json({ error: 'Event not found' }, 404);
  }

  // If slug is changing, check uniqueness
  if (body.slug) {
    const { data: taken } = await db
      .from('events')
      .select('id')
      .eq('slug', body.slug)
      .neq('id', id)
      .maybeSingle();

    if (taken) {
      return c.json({ error: 'This URL slug is already taken' }, 409);
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (body.name !== undefined) updatePayload.name = body.name;
  if (body.description !== undefined) updatePayload.description = body.description;
  if (body.date !== undefined) updatePayload.date = body.date;
  if (body.location !== undefined) updatePayload.location = body.location;
  if (body.slug !== undefined) updatePayload.slug = body.slug;
  if (body.isActive !== undefined) updatePayload.is_active = body.isActive;
  // Hash the new password if provided — never store plaintext gate passwords.
  if (body.adminPassword !== undefined) {
    updatePayload.admin_password = await bcrypt.hash(body.adminPassword, 10);
  }

  const { data: updated, error } = await db
    .from('events')
    .update(updatePayload)
    .eq('id', id)
    .select('id, org_id, name, description, date, location, slug, is_active, created_at')
    .single();

  if (error || !updated) {
    console.error('[events/update]', error);
    return c.json({ error: 'Failed to update event' }, 500);
  }

  return c.json(updated);
});

// DELETE /events/:id (admin only)
eventsRouter.delete('/:id', requireRole('admin'), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const { data: existing } = await db
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!existing) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const { error } = await db.from('events').delete().eq('id', id);

  if (error) {
    console.error('[events/delete]', error);
    return c.json({ error: 'Failed to delete event' }, 500);
  }

  return c.json({ ok: true });
});
