// apps/api/src/routes/event-members.ts
// Per-event team management.
// Admins can assign/remove users to specific events.
// Co-organizers can VIEW the team for events they belong to.
// Routes are mounted at /events/:id/members via the main router.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireEventAccess } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

const phoneSchema = z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number');

const assignSchema = z.object({
  phone: phoneSchema,
  role:  z.enum(['co_organizer', 'scanner', 'leader']).default('co_organizer'),
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
      users ( id, name, mobile )
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
        id:     (m.users as any)?.id,
        name:   (m.users as any)?.name,
        mobile: (m.users as any)?.mobile,
      },
    }))
  );
});

// ─── GET /events/:id/members/lookup — check if phone number can be assigned ───
eventMembersRouter.get('/lookup', requireRole('admin'), async (c) => {
  const params = c.req.param() as { id: string; memberId?: string }; const eventId = params.id;
  const user  = c.get('user');
  const phone = c.req.query('phone');

  if (!phone || !/^\d{10}$/.test(phone)) return c.json({ error: 'phone query param required (10 digits)' }, 400);

  // Must belong to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Does user exist with this phone?
  const { data: existingUser } = await db
    .from('users').select('id, name, mobile_verified').eq('mobile', phone).maybeSingle();

  if (!existingUser) return c.json({ found: false });
  if (!existingUser.mobile_verified) return c.json({ found: true, unverified: true });

  // Cannot assign yourself
  if (existingUser.id === user.sub) return c.json({ found: true, isSelf: true });

  // Is user an org-level admin/co-organizer of THIS org? Already has full access
  const { data: orgMembership } = await db
    .from('org_members').select('id, org_id, role').eq('user_id', existingUser.id).maybeSingle();

  if (orgMembership && orgMembership.org_id === user.orgId && ['admin', 'co_organizer'].includes(orgMembership.role)) {
    return c.json({ found: true, isOrgAdmin: true, name: existingUser.name });
  }

  // Is user an org member of a DIFFERENT org?
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

  const inOurOrg = orgMembership?.org_id === user.orgId;
  return c.json({ found: true, name: existingUser.name, inOurOrg });
});

// ─── POST /events/:id/members — assign an existing user to this event ─────────
eventMembersRouter.post('/', requireRole('admin'), zValidator('json', assignSchema), async (c) => {
  const params = c.req.param() as { id: string; memberId?: string }; const eventId = params.id;
  const user = c.get('user');
  const { phone, role } = c.req.valid('json');

  // Verify event belongs to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Find user by phone — must already have an account
  const { data: targetUser } = await db
    .from('users')
    .select('id, mobile_verified')
    .eq('mobile', phone)
    .maybeSingle();

  if (!targetUser) {
    return c.json({ error: 'No Entriq account found with this phone number. Ask them to sign up first.' }, 404);
  }
  if (!targetUser.mobile_verified) {
    return c.json({ error: 'This user has not verified their phone number yet.' }, 400);
  }

  // Cannot assign yourself
  if (targetUser.id === user.sub) {
    return c.json({ error: 'You cannot assign yourself — as org admin you already have full access.' }, 400);
  }

  // Org admins/co-organizers already have org-wide access — no need for event-level assignment
  const { data: targetOrgMember } = await db
    .from('org_members').select('id, role').eq('user_id', targetUser.id).eq('org_id', user.orgId!).maybeSingle();
  if (targetOrgMember && ['admin', 'co_organizer'].includes(targetOrgMember.role)) {
    return c.json({ error: 'This user is already an org-level admin or co-organizer with full access.' }, 400);
  }
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

  const { data: userDetails } = await db
    .from('users').select('id, name, mobile').eq('id', targetUser.id).single();

  return c.json({
    id:         assignment.id,
    role:       assignment.role,
    created_at: assignment.created_at,
    user:       userDetails,
  }, 201);
});

// ─── PATCH /events/:id/members/:memberId — change role ───────────────────────
eventMembersRouter.patch('/:memberId', requireRole('admin'), zValidator('json', z.object({
  role: z.enum(['co_organizer', 'scanner', 'leader']),
  autoAcknowledge: z.boolean().optional(), // when demoting a leader, auto-ack their pending referrals
})), async (c) => {
  const params = c.req.param() as { id: string; memberId: string }; const eventId = params.id; const memberId = params.memberId;
  const user = c.get('user');
  const { role, autoAcknowledge } = c.req.valid('json');

  // Verify event belongs to org
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', user.orgId!).maybeSingle();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Fetch current member to check if we're demoting a leader
  const { data: currentMember } = await db
    .from('event_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (!currentMember) return c.json({ error: 'Member not found' }, 404);

  const isDemotingLeader = currentMember.role === 'leader' && role !== 'leader';

  if (isDemotingLeader) {
    // Count unacknowledged referrals by this leader for this event
    const { count: unackCount } = await db
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('referred_by_user_id', currentMember.user_id)
      .eq('is_acknowledged', false);

    const pendingCount = unackCount ?? 0;

    if (pendingCount > 0 && !autoAcknowledge) {
      // Return warning without making changes — frontend must confirm
      return c.json({
        warning: 'leader_has_pending_referrals',
        pendingReferrals: pendingCount,
        memberId,
        newRole: role,
      }, 409);
    }

    if (pendingCount > 0 && autoAcknowledge) {
      // Auto-acknowledge all pending referrals before demoting
      await db
        .from('registrations')
        .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('referred_by_user_id', currentMember.user_id)
        .eq('is_acknowledged', false);
    }
  }

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
