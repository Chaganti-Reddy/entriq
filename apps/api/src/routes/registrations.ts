// apps/api/src/routes/registrations.ts
// Registrations: user must be logged in to register. Protected list endpoint for org members.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../services/db.js';
import { generateUniqueCode } from '../services/qr.js';
import { registrationLimiter } from '../middleware/ratelimit.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const registrationSchema = z.object({
  name:       z.string().min(1).max(100).trim(),
  surname:    z.string().min(1).max(100).trim(),
  state:      z.string().min(1).max(100).trim(),
  city:       z.string().min(1).max(100).trim(),
  mobile:     z.string().min(7).max(20).regex(/^[+\d\s()-]+$/, 'Invalid mobile number').trim(),
  profession: z.string().min(1).max(100).trim(),
  otherInfo:  z.string().max(500).trim().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const registrationsRouter = new Hono<AppEnv>();

// POST /registrations/:eventSlug — user must be logged in
registrationsRouter.post('/:eventSlug', registrationLimiter, authMiddleware, zValidator('json', registrationSchema), async (c) => {
  const user = c.get('user');
  const { eventSlug } = c.req.param();
  const body = c.req.valid('json');

  // Look up event by slug
  const { data: event } = await db
    .from('events')
    .select('id, name, is_active')
    .eq('slug', eventSlug)
    .maybeSingle();

  if (!event)            return c.json({ error: 'Event not found' }, 404);
  if (!event.is_active)  return c.json({ error: 'Registrations are closed for this event' }, 410);

  // Check duplicate: same user + same event
  const { data: duplicate } = await db
    .from('registrations')
    .select('id, unique_code')
    .eq('event_id', event.id)
    .eq('user_id', user.sub)
    .maybeSingle();

  if (duplicate) {
    return c.json({ error: 'You are already registered for this event', alreadyRegistered: true, uniqueCode: duplicate.unique_code }, 409);
  }

  const uniqueCode = generateUniqueCode();

  const { data: registration, error: insertError } = await db
    .from('registrations')
    .insert({
      event_id:    event.id,
      user_id:     user.sub,
      email:       user.email,
      name:        body.name,
      surname:     body.surname,
      state:       body.state,
      city:        body.city,
      mobile:      body.mobile,
      profession:  body.profession,
      other_info:  body.otherInfo ?? null,
      unique_code: uniqueCode,
      status:      'not_approved',
    })
    .select('id, unique_code')
    .single();

  if (insertError || !registration) {
    if (insertError?.code === '23505') {
      return c.json({ error: 'You are already registered for this event', alreadyRegistered: true }, 409);
    }
    console.error('[registrations/create]', insertError);
    return c.json({ error: 'Failed to save registration' }, 500);
  }

  return c.json({ ok: true, uniqueCode: registration.unique_code, registrationId: registration.id }, 201);
});

// POST /registrations/bulk-approve — approve multiple registrations at once (admin/co-organizer)
registrationsRouter.post(
  '/bulk-approve',
  authMiddleware,
  requireRole('co_organizer', 'admin'),
  zValidator('json', z.object({ ids: z.array(z.string().uuid()).min(1).max(200) })),
  async (c) => {
    const user = c.get('user');
    const { ids } = c.req.valid('json');

    // Fetch all requested registrations with their event's org
    const { data: regs, error: fetchError } = await db
      .from('registrations')
      .select('id, event_id, status')
      .in('id', ids);

    if (fetchError || !regs?.length) return c.json({ error: 'No valid registrations found' }, 404);

    // Verify every registration's event belongs to the caller's org
    const eventIds = [...new Set(regs.map((r) => r.event_id))];
    const { data: events } = await db
      .from('events')
      .select('id')
      .in('id', eventIds)
      .eq('org_id', user.orgId!);

    const allowedEventIds = new Set((events ?? []).map((e) => e.id));

    // Co-organizer event-only: further restrict to assigned events
    let assignedEventIds: Set<string> | null = null;
    if (user.role === 'co_organizer' && user.isEventMember) {
      const { data: assignments } = await db
        .from('event_members')
        .select('event_id')
        .in('event_id', [...allowedEventIds])
        .eq('user_id', user.sub);
      assignedEventIds = new Set((assignments ?? []).map((a) => a.event_id));
    }

    const authorizedIds = regs
      .filter((r) => {
        if (!allowedEventIds.has(r.event_id)) return false;
        if (assignedEventIds && !assignedEventIds.has(r.event_id)) return false;
        return true;
      })
      .map((r) => r.id);

    if (!authorizedIds.length) return c.json({ error: 'Forbidden' }, 403);

    const { error: updateError } = await db
      .from('registrations')
      .update({ status: 'approved' })
      .in('id', authorizedIds)
      .eq('status', 'not_approved');

    if (updateError) {
      console.error('[registrations/bulk-approve]', updateError);
      return c.json({ error: 'Failed to approve registrations' }, 500);
    }

    return c.json({ ok: true, approved: authorizedIds.length });
  }
);

// PATCH /registrations/:id/approve — approve a single registration (admin/co-organizer)
registrationsRouter.patch('/:id/approve', authMiddleware, requireRole('co_organizer', 'admin'), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const { data: reg } = await db
    .from('registrations')
    .select('id, event_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!reg) return c.json({ error: 'Registration not found' }, 404);

  // Verify event belongs to caller's org
  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('id', reg.event_id)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!event) return c.json({ error: 'Forbidden' }, 403);

  // Co-organizer event-only: must be assigned to this event
  if (user.role === 'co_organizer' && user.isEventMember) {
    const { data: assignment } = await db
      .from('event_members')
      .select('id')
      .eq('event_id', reg.event_id)
      .eq('user_id', user.sub)
      .maybeSingle();
    if (!assignment) return c.json({ error: 'You are not assigned to this event' }, 403);
  }

  if (reg.status === 'approved') return c.json({ ok: true, alreadyApproved: true });

  const { error: updateError } = await db
    .from('registrations')
    .update({ status: 'approved' })
    .eq('id', id);

  if (updateError) {
    console.error('[registrations/approve]', updateError);
    return c.json({ error: 'Failed to approve registration' }, 500);
  }

  return c.json({ ok: true });
});

// GET /registrations/event/:eventId — org members only, returns all registrations for event
// Co-organizers: scoped to events they are assigned to via event_members.
registrationsRouter.get('/event/:eventId', authMiddleware, requireRole('co_organizer', 'admin'), async (c) => {
  const user = c.get('user');
  const { eventId } = c.req.param();

  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('org_id', user.orgId!)
    .maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Event-only members must be assigned to this specific event.
  // Org-level co-organizers (memberId set) bypass — org membership grants access.
  if (user.role === 'co_organizer' && user.isEventMember) {
    const { data: assignment } = await db
      .from('event_members')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.sub)
      .maybeSingle();
    if (!assignment) return c.json({ error: 'You are not assigned to this event' }, 403);
  }

  const { data: registrations, error } = await db
    .from('registrations')
    .select('id, email, name, surname, state, city, mobile, profession, other_info, unique_code, status, registered_at')
    .eq('event_id', eventId)
    .order('registered_at', { ascending: false });

  if (error) {
    console.error('[registrations/list]', error);
    return c.json({ error: 'Failed to fetch registrations' }, 500);
  }

  return c.json(registrations ?? []);
});

