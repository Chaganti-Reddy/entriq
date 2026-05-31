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
  name:             z.string().min(1).max(100).trim(),
  surname:          z.string().min(1).max(100).trim(),
  state:            z.string().min(1).max(100).trim(),
  city:             z.string().min(1).max(100).trim(),
  mobile:           z.string().min(7).max(20).regex(/^[+\d\s()-]+$/, 'Invalid mobile number').trim(),
  profession:       z.string().min(1).max(100).trim(),
  otherInfo:        z.string().max(500).trim().optional(),
  referredByUserId: z.string().uuid().optional(),
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
    .select('id, name, org_id, is_active')
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

  // Validate referredByUserId — must be a leader (event_members) OR org admin/co-organizer
  let referredByName: string | null = null;
  if (body.referredByUserId) {
    // Check event-level leader first
    const { data: leaderAssignment } = await db
      .from('event_members')
      .select('user_id, users(name)')
      .eq('event_id', event.id)
      .eq('user_id', body.referredByUserId)
      .eq('role', 'leader')
      .maybeSingle();

    if (leaderAssignment) {
      referredByName = (leaderAssignment.users as any)?.name ?? null;
    } else {
      // Check org-level admin or co-organizer
      const { data: orgMember } = await db
        .from('org_members')
        .select('user_id, users(name)')
        .eq('org_id', event.org_id)
        .eq('user_id', body.referredByUserId)
        .in('role', ['admin', 'co_organizer'])
        .maybeSingle();

      if (!orgMember) {
        return c.json({ error: 'Invalid referrer — user is not authorised to refer for this event' }, 400);
      }
      referredByName = (orgMember.users as any)?.name ?? null;
    }
  }

  const uniqueCode = generateUniqueCode();

  const { data: registration, error: insertError } = await db
    .from('registrations')
    .insert({
      event_id:             event.id,
      user_id:              user.sub,
      email:                user.email ?? null,
      name:                 body.name,
      surname:              body.surname,
      state:                body.state,
      city:                 body.city,
      mobile:               body.mobile,
      profession:           body.profession,
      other_info:           body.otherInfo ?? null,
      unique_code:          uniqueCode,
      status:               'not_approved',
      referred_by_user_id:  body.referredByUserId ?? null,
      referred_by_name:     referredByName,
      is_acknowledged:      false,
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

// POST /registrations/bulk-approve — approve multiple registrations at once (admin/co-organizer/leader)
registrationsRouter.post(
  '/bulk-approve',
  authMiddleware,
  requireRole('co_organizer', 'admin', 'leader'),
  zValidator('json', z.object({ ids: z.array(z.string().uuid()).min(1).max(200) })),
  async (c) => {
    const user = c.get('user');
    const { ids } = c.req.valid('json');

    const { data: regs, error: fetchError } = await db
      .from('registrations')
      .select('id, event_id, status')
      .in('id', ids);

    if (fetchError || !regs?.length) return c.json({ error: 'No valid registrations found' }, 404);

    const eventIds = [...new Set(regs.map((r) => r.event_id))];
    const { data: events } = await db
      .from('events')
      .select('id')
      .in('id', eventIds)
      .eq('org_id', user.orgId!);

    const allowedEventIds = new Set((events ?? []).map((e) => e.id));

    // Co-organizer / leader event-only: further restrict to assigned events
    let assignedEventIds: Set<string> | null = null;
    if ((user.role === 'co_organizer' || user.role === 'leader') && user.isEventMember) {
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
      .update({ status: 'admin_approved' })
      .in('id', authorizedIds)
      .eq('status', 'not_approved');

    if (updateError) {
      console.error('[registrations/bulk-approve]', updateError);
      return c.json({ error: 'Failed to approve registrations' }, 500);
    }

    return c.json({ ok: true, approved: authorizedIds.length });
  }
);

// PATCH /registrations/:id/approve — approve a single registration (admin/co-organizer/leader)
registrationsRouter.patch('/:id/approve', authMiddleware, requireRole('co_organizer', 'admin', 'leader'), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const { data: reg } = await db
    .from('registrations')
    .select('id, event_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!reg) return c.json({ error: 'Registration not found' }, 404);

  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('id', reg.event_id)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!event) return c.json({ error: 'Forbidden' }, 403);

  // Co-organizer / leader event-only: must be assigned to this event
  if ((user.role === 'co_organizer' || user.role === 'leader') && user.isEventMember) {
    const { data: assignment } = await db
      .from('event_members')
      .select('id')
      .eq('event_id', reg.event_id)
      .eq('user_id', user.sub)
      .maybeSingle();
    if (!assignment) return c.json({ error: 'You are not assigned to this event' }, 403);
  }

  if (reg.status !== 'not_approved') return c.json({ ok: true, alreadyApproved: true });

  const { error: updateError } = await db
    .from('registrations')
    .update({ status: 'admin_approved' })
    .eq('id', id);

  if (updateError) {
    console.error('[registrations/approve]', updateError);
    return c.json({ error: 'Failed to approve registration' }, 500);
  }

  return c.json({ ok: true });
});

// PATCH /registrations/:id/acknowledge — leader (or admin/co-organizer override) confirms referral
registrationsRouter.patch('/:id/acknowledge', authMiddleware, async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const { data: reg } = await db
    .from('registrations')
    .select('id, event_id, referred_by_user_id, is_acknowledged')
    .eq('id', id)
    .maybeSingle();

  if (!reg) return c.json({ error: 'Registration not found' }, 404);
  if (!reg.referred_by_user_id) return c.json({ error: 'This registration has no referrer' }, 400);
  if (reg.is_acknowledged) return c.json({ ok: true, alreadyAcknowledged: true });

  const isOrgAdmin = user.role === 'admin' && !user.isEventMember;
  const isEventCoOrg = (user.role === 'co_organizer' || user.role === 'admin') && user.isEventMember;

  if (isOrgAdmin) {
    // Org admin — verify event belongs to their org
    const { data: event } = await db
      .from('events').select('id').eq('id', reg.event_id).eq('org_id', user.orgId!).maybeSingle();
    if (!event) return c.json({ error: 'Not authorised' }, 403);
  } else if (isEventCoOrg) {
    // Event co-organizer — verify they are assigned to this event
    const { data: em } = await db
      .from('event_members').select('id')
      .eq('event_id', reg.event_id).eq('user_id', user.sub).maybeSingle();
    if (!em) return c.json({ error: 'Not authorised' }, 403);
  } else {
    // Must be the original leader (even if their role has since changed)
    if (reg.referred_by_user_id !== user.sub) {
      return c.json({ error: 'You are not the referrer for this registration' }, 403);
    }
    // Verify they were (or still are) a leader/former-leader on this event
    const { data: em } = await db
      .from('event_members').select('id')
      .eq('event_id', reg.event_id).eq('user_id', user.sub).maybeSingle();
    if (!em) return c.json({ error: 'You are not a member of this event' }, 403);
  }

  const { error: updateError } = await db
    .from('registrations')
    .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    console.error('[registrations/acknowledge]', updateError);
    return c.json({ error: 'Failed to acknowledge' }, 500);
  }

  return c.json({ ok: true });
});

// GET /registrations/event/:eventId — org members + leaders, returns all registrations for event
registrationsRouter.get('/event/:eventId', authMiddleware, requireRole('co_organizer', 'admin', 'leader'), async (c) => {
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
  if ((user.role === 'co_organizer' || user.role === 'leader') && user.isEventMember) {
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
    .select('id, email, name, surname, state, city, mobile, profession, other_info, unique_code, status, registered_at, referred_by_user_id, referred_by_name, is_acknowledged, acknowledged_at')
    .eq('event_id', eventId)
    .order('registered_at', { ascending: false });

  if (error) {
    console.error('[registrations/list]', error);
    return c.json({ error: 'Failed to fetch registrations' }, 500);
  }

  return c.json(registrations ?? []);
});

// POST /registrations/bulk-delete — delete multiple registrations at once (admin/co-organizer/leader)
registrationsRouter.post(
  '/bulk-delete',
  authMiddleware,
  requireRole('co_organizer', 'admin', 'leader'),
  zValidator('json', z.object({ ids: z.array(z.string().uuid()).min(1).max(200) })),
  async (c) => {
    const user = c.get('user');
    const { ids } = c.req.valid('json');

    const { data: regs, error: fetchError } = await db
      .from('registrations')
      .select('id, event_id')
      .in('id', ids);

    if (fetchError || !regs?.length) return c.json({ error: 'No valid registrations found' }, 404);

    const eventIds = [...new Set(regs.map((r) => r.event_id))];
    const { data: events } = await db
      .from('events')
      .select('id')
      .in('id', eventIds)
      .eq('org_id', user.orgId!);

    const allowedEventIds = new Set((events ?? []).map((e) => e.id));

    let assignedEventIds: Set<string> | null = null;
    if ((user.role === 'co_organizer' || user.role === 'leader') && user.isEventMember) {
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

    await db.from('checkins').delete().in('registration_id', authorizedIds);

    const { error: deleteError } = await db.from('registrations').delete().in('id', authorizedIds);

    if (deleteError) {
      console.error('[registrations/bulk-delete]', deleteError);
      return c.json({ error: 'Failed to delete registrations' }, 500);
    }

    return c.json({ ok: true, deleted: authorizedIds.length });
  }
);

// DELETE /registrations/:id — admin/co-organizer/leader can remove a registration
registrationsRouter.delete('/:id', authMiddleware, requireRole('co_organizer', 'admin', 'leader'), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const { data: reg } = await db
    .from('registrations')
    .select('id, event_id')
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

  // Co-organizer / leader event-only: must be assigned to this event
  if ((user.role === 'co_organizer' || user.role === 'leader') && user.isEventMember) {
    const { data: assignment } = await db
      .from('event_members')
      .select('id')
      .eq('event_id', reg.event_id)
      .eq('user_id', user.sub)
      .maybeSingle();
    if (!assignment) return c.json({ error: 'You are not assigned to this event' }, 403);
  }

  const { error } = await db.from('registrations').delete().eq('id', id);

  if (error) {
    console.error('[registrations/delete]', error);
    return c.json({ error: 'Failed to delete registration' }, 500);
  }

  return c.json({ ok: true });
});

