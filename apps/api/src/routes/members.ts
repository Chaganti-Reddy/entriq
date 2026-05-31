// apps/api/src/routes/members.ts
// Org member management — admins invite/manage co-organizers.
// Phone-first: only existing phone-verified Entriq accounts can be added.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

const phoneSchema = z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number');

const inviteSchema = z.object({
  phone: phoneSchema,
  role:  z.literal('co_organizer'),
});

const updateMemberSchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
});

export const membersRouter = new Hono<AppEnv>();

membersRouter.use('*', authMiddleware);
membersRouter.use('*', requireRole('admin'));

// GET /members — list all members in this org
membersRouter.get('/', async (c) => {
  const user = c.get('user');

  const { data: members, error } = await db
    .from('org_members')
    .select('id, user_id, role, status, invited_by, created_at, users(name, mobile)')
    .eq('org_id', user.orgId!)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[members/list]', error);
    return c.json({ error: 'Failed to fetch members' }, 500);
  }

  const flat = (members ?? []).map((m: any) => ({
    id:         m.id,
    user_id:    m.user_id,
    name:       m.users?.name ?? '',
    mobile:     m.users?.mobile ?? '',
    role:       m.role,
    status:     m.status,
    invited_by: m.invited_by,
    created_at: m.created_at,
  }));

  return c.json(flat);
});

// GET /members/lookup?phone= — check if a phone-verified account can be added to this org
membersRouter.get('/lookup', async (c) => {
  const user  = c.get('user');
  const phone = c.req.query('phone')?.trim();
  if (!phone || !/^\d{10}$/.test(phone)) return c.json({ error: 'phone query required (10 digits)' }, 400);

  const { data: targetUser } = await db
    .from('users')
    .select('id, name, mobile_verified')
    .eq('mobile', phone)
    .maybeSingle();

  if (!targetUser) return c.json({ found: false });
  if (!targetUser.mobile_verified) return c.json({ found: true, unverified: true });

  // Check if they're in any org
  const { data: membership } = await db
    .from('org_members')
    .select('org_id')
    .eq('user_id', targetUser.id)
    .eq('status', 'active')
    .maybeSingle();

  return c.json({
    found:    true,
    name:     targetUser.name,
    sameOrg:  membership?.org_id === user.orgId,
    otherOrg: !!membership && membership.org_id !== user.orgId,
  });
});

// POST /members/invite — add an existing phone-verified user as co-organizer
membersRouter.post('/invite', zValidator('json', inviteSchema), async (c) => {
  const user = c.get('user');
  const { phone, role } = c.req.valid('json');

  const { data: targetUser } = await db
    .from('users')
    .select('id, name, mobile_verified')
    .eq('mobile', phone)
    .maybeSingle();

  if (!targetUser) {
    return c.json({ error: 'No Entriq account found with this phone number. Ask them to sign up first.' }, 404);
  }
  if (!targetUser.mobile_verified) {
    return c.json({ error: 'This user has not verified their phone number yet.' }, 400);
  }

  const { data: alreadyMember } = await db
    .from('org_members')
    .select('id')
    .eq('user_id', targetUser.id)
    .eq('org_id', user.orgId!)
    .maybeSingle();
  if (alreadyMember) return c.json({ error: 'This person is already a member of your organisation' }, 409);

  const { data: otherOrg } = await db
    .from('org_members')
    .select('id')
    .eq('user_id', targetUser.id)
    .eq('status', 'active')
    .maybeSingle();
  if (otherOrg) return c.json({ error: 'This user already belongs to another organisation' }, 409);

  const { data: member, error: memberError } = await db
    .from('org_members')
    .insert({ user_id: targetUser.id, org_id: user.orgId!, role, status: 'active', invited_by: user.memberId! })
    .select('id, role, status, created_at')
    .single();

  if (memberError || !member) {
    console.error('[members/invite]', memberError);
    return c.json({ error: 'Failed to create member' }, 500);
  }

  return c.json({ id: member.id, name: targetUser.name, mobile: phone, role: member.role, status: member.status, created_at: member.created_at }, 201);
});

// PATCH /members/:id — update member status
membersRouter.patch('/:id', zValidator('json', updateMemberSchema), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();
  const body = c.req.valid('json');

  if (id === user.memberId && body.status === 'inactive') {
    return c.json({ error: 'You cannot deactivate your own account' }, 400);
  }

  const { data: existing } = await db
    .from('org_members')
    .select('id, role')
    .eq('id', id)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!existing) return c.json({ error: 'Member not found' }, 404);
  if (existing.role === 'admin') return c.json({ error: 'Cannot modify another admin account' }, 403);

  const { data: updated, error } = await db
    .from('org_members')
    .update({ status: body.status })
    .eq('id', id)
    .select('id, role, status')
    .single();

  if (error || !updated) return c.json({ error: 'Failed to update member' }, 500);
  return c.json(updated);
});

// DELETE /members/:id — remove co-organizer
membersRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  if (id === user.memberId) return c.json({ error: 'You cannot remove yourself' }, 400);

  const { data: member } = await db
    .from('org_members')
    .select('id, role')
    .eq('id', id)
    .eq('org_id', user.orgId!)
    .maybeSingle();

  if (!member) return c.json({ error: 'Member not found' }, 404);
  if (member.role === 'admin') return c.json({ error: 'Cannot remove another admin account' }, 403);

  const { error } = await db.from('org_members').delete().eq('id', id);
  if (error) return c.json({ error: 'Failed to remove member' }, 500);
  return c.json({ ok: true });
});


