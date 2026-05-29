// apps/api/src/routes/event-members.ts
// Per-event team management.
// Admins can assign/remove users to specific events.
// Co-organizers can VIEW the team for events they belong to.
// Routes are mounted at /events/:id/members via the main router.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../services/db.js';
import { anonDb } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireEventAccess } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

const assignSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['co_organizer', 'scanner']).default('co_organizer'),
  // New user fields (optional — only needed if user doesn't exist yet)
  name:     z.string().min(2).max(100).trim().optional(),
  password: z.string().min(8).max(100).optional(),
});

export const eventMembersRouter = new Hono<AppEnv>();

eventMembersRouter.use('*', authMiddleware);

// ─── GET /events/:id/members — list event team ────────────────────────────────
// Admin: sees all. Co-organizer: sees team for events they are in.
eventMembersRouter.get('/', requireRole('co_organizer', 'admin'), requireEventAccess, async (c) => {
  const params = c.req.param() as { id: string; memberId?: string }; const eventId = params.id;
  const user = c.get('user');

  // Verify event belongs to org (IDOR prevention) — admin bypasses requireEventAccess
  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('org_id', user.orgId!)
    .maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const { data: members, error } = await db
    .from('event_members')
    .select(`
      id, role, created_at,
      users ( id, name, email )
    `)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[event-members/list]', error);
    return c.json({ error: 'Failed to fetch event team' }, 500);
  }

  return c.json(
    (members ?? []).map((m) => ({
      id:         m.id,
      role:       m.role,
      created_at: m.created_at,
      user: {
        id:    (m.users as any)?.id,
        name:  (m.users as any)?.name,
        email: (m.users as any)?.email,
      },
    }))
  );
});

// ─── GET /events/:id/members/lookup — check if email can be assigned ──────────
eventMembersRouter.get('/lookup', requireRole('admin'), async (c) => {
  const params = c.req.param() as { id: string; memberId?: string }; const eventId = params.id;
  const user  = c.get('user');
  const email = c.req.query('email');

  if (!email) return c.json({ error: 'email query param required' }, 400);

  // Must belong to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Is super admin?
  const { data: sa } = await db.from('super_admins').select('id').eq('email', email).maybeSingle();
  if (sa) return c.json({ found: true, isSuperAdmin: true });

  // Does user exist?
  const { data: existingUser } = await db
    .from('users').select('id, name, email').eq('email', email).maybeSingle();

  if (!existingUser) return c.json({ found: false });

  // Is user an org member?
  const { data: orgMembership } = await db
    .from('org_members').select('id, org_id').eq('user_id', existingUser.id).maybeSingle();

  if (orgMembership && orgMembership.org_id !== user.orgId) {
    return c.json({ found: true, otherOrg: true });
  }

  // Already assigned to this event?
  const { data: eventMembership } = await db
    .from('event_members')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', existingUser.id)
    .maybeSingle();

  if (eventMembership) return c.json({ found: true, alreadyAssigned: true, name: existingUser.name });

  // Is an org member of our org? Fine to assign.
  const inOurOrg = orgMembership?.org_id === user.orgId;

  return c.json({
    found:    true,
    name:     existingUser.name,
    inOurOrg,
  });
});

// ─── POST /events/:id/members — assign a user to this event ──────────────────
eventMembersRouter.post('/', requireRole('admin'), zValidator('json', assignSchema), async (c) => {
  const params = c.req.param() as { id: string; memberId?: string }; const eventId = params.id;
  const user = c.get('user');
  const { email, role, name, password } = c.req.valid('json');

  // Verify event belongs to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Block super admins from being assigned
  const { data: sa } = await db.from('super_admins').select('id').eq('email', email).maybeSingle();
  if (sa) return c.json({ error: 'Super admin accounts cannot be assigned as event members' }, 400);

  // Find or create user
  let targetUser: { id: string } | null = null;
  const { data: existing } = await db.from('users').select('id').eq('email', email).maybeSingle();

  if (existing) {
    targetUser = existing;
  } else {
    // Create new user via Supabase Auth
    if (!name || !password) {
      return c.json({ error: 'name and password are required to create a new user' }, 400);
    }
    const { data: created, error: createErr } = await anonDb.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (createErr || !created.user) {
      console.error('[event-members/create-user]', createErr);
      return c.json({ error: createErr?.message ?? 'Failed to create user' }, 500);
    }
    // Insert into public.users (trigger may also do this, but ensure it exists)
    const { data: newProfile, error: profileErr } = await db
      .from('users')
      .upsert({ id: created.user.id, email, name }, { onConflict: 'id' })
      .select('id')
      .single();
    if (profileErr || !newProfile) {
      console.error('[event-members/profile]', profileErr);
      return c.json({ error: 'User created but profile setup failed' }, 500);
    }
    targetUser = newProfile;
  }

  // Check if already an org member of a DIFFERENT org — cannot assign
  const { data: orgMembership } = await db
    .from('org_members').select('id, org_id').eq('user_id', targetUser.id).maybeSingle();
  if (orgMembership && orgMembership.org_id !== user.orgId) {
    return c.json({ error: 'This user belongs to another organisation' }, 409);
  }

  // Get inviter org_member id for audit trail
  const { data: inviterMembership } = await db
    .from('org_members').select('id').eq('user_id', user.sub).maybeSingle();

  // Insert into event_members (upsert to be idempotent)
  const { data: assignment, error: assignErr } = await db
    .from('event_members')
    .upsert(
      {
        event_id:   eventId,
        user_id:    targetUser.id,
        org_id:     user.orgId!,
        role,
        invited_by: inviterMembership?.id ?? null,
      },
      { onConflict: 'event_id,user_id' }
    )
    .select('id, role, created_at')
    .single();

  if (assignErr || !assignment) {
    console.error('[event-members/assign]', assignErr);
    return c.json({ error: 'Failed to assign member' }, 500);
  }

  // Fetch user details for response
  const { data: userDetails } = await db
    .from('users').select('id, name, email').eq('id', targetUser.id).single();

  return c.json({
    id:         assignment.id,
    role:       assignment.role,
    created_at: assignment.created_at,
    user:       userDetails,
  }, 201);
});

// ─── PATCH /events/:id/members/:memberId — change role ───────────────────────
eventMembersRouter.patch('/:memberId', requireRole('admin'), zValidator('json', z.object({
  role: z.enum(['co_organizer', 'scanner']),
})), async (c) => {
  const params = c.req.param() as { id: string; memberId: string }; const eventId = params.id; const memberId = params.memberId;
  const user = c.get('user');
  const { role } = c.req.valid('json');

  // Verify event belongs to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const { data: updated, error } = await db
    .from('event_members')
    .update({ role })
    .eq('id', memberId)
    .eq('event_id', eventId)
    .select('id, role')
    .single();

  if (error || !updated) return c.json({ error: 'Member not found' }, 404);

  return c.json(updated);
});

// ─── DELETE /events/:id/members/:memberId — remove from event ─────────────────
eventMembersRouter.delete('/:memberId', requireRole('admin'), async (c) => {
  const params = c.req.param() as { id: string; memberId: string }; const eventId = params.id; const memberId = params.memberId;
  const user = c.get('user');

  // Verify event belongs to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const { error } = await db
    .from('event_members')
    .delete()
    .eq('id', memberId)
    .eq('event_id', eventId);

  if (error) {
    console.error('[event-members/remove]', error);
    return c.json({ error: 'Failed to remove member' }, 500);
  }

  return c.json({ ok: true });
});
