// apps/api/src/routes/members.ts
// Org member management — admins invite/manage co-organizers.
// Smart invite: if invitee already has an account, no password needed.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';

const inviteSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  role:     z.literal('co_organizer'),
  // Only required when creating a new account
  name:     z.string().min(2).max(100).trim().optional(),
  password: z.string().min(8).max(128).optional(),
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
    .select('id, user_id, role, status, invited_by, created_at, users(name, email)')
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
    email:      m.users?.email ?? '',
    role:       m.role,
    status:     m.status,
    invited_by: m.invited_by,
    created_at: m.created_at,
  }));

  return c.json(flat);
});

// GET /members/lookup?email= — check if email is a registered user
membersRouter.get('/lookup', async (c) => {
  const email = c.req.query('email')?.toLowerCase().trim();
  if (!email) return c.json({ error: 'email query required' }, 400);

  // Check public.users first
  let existing: { id: string; name: string } | null = null;
  const { data: regularUser } = await db
    .from('users')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();

  if (regularUser) {
    existing = regularUser;
  } else {
    // Also check super_admins table — they don't have a public.users record
    const { data: superAdmin } = await db
      .from('super_admins')
      .select('id, name')
      .eq('email', email)
      .maybeSingle();
    if (superAdmin) {
      return c.json({ found: true, name: superAdmin.name, isSuperAdmin: true, sameOrg: false, otherOrg: false });
    }
  }

  if (!existing) return c.json({ found: false });

  // Check if they're already in any org
  const { data: membership } = await db
    .from('org_members')
    .select('org_id')
    .eq('user_id', existing.id)
    .eq('status', 'active')
    .maybeSingle();

  return c.json({
    found:    true,
    name:     existing.name,
    sameOrg:  membership?.org_id === c.get('user').orgId,
    otherOrg: !!membership && membership.org_id !== c.get('user').orgId,
  });
});

// POST /members/invite — invite a co-organizer (creates account only if needed)
membersRouter.post('/invite', zValidator('json', inviteSchema), async (c) => {
  const user = c.get('user');
  const { email, role, name, password } = c.req.valid('json');

  // Block super admins from being added as org members
  const { data: isSuperAdmin } = await db.from('super_admins').select('id').eq('email', email).maybeSingle();
  if (isSuperAdmin) return c.json({ error: 'Super admins cannot be added as org members' }, 400);

  const { data: userForEmail } = await db
    .from('users')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();

  let userId: string;
  let resolvedName: string;

  if (userForEmail) {
    // Existing user — no password needed
    const { data: alreadyMember } = await db
      .from('org_members')
      .select('id')
      .eq('user_id', userForEmail.id)
      .eq('org_id', user.orgId!)
      .maybeSingle();
    if (alreadyMember) return c.json({ error: 'This person is already a member of your organisation' }, 409);

    const { data: otherOrg } = await db
      .from('org_members')
      .select('id')
      .eq('user_id', userForEmail.id)
      .eq('status', 'active')
      .maybeSingle();
    if (otherOrg) return c.json({ error: 'This user already belongs to another organisation' }, 409);

    userId = userForEmail.id;
    resolvedName = userForEmail.name;
  } else {
    // New user — name + password required
    if (!name || !password) {
      return c.json({ error: 'Name and password are required for new users' }, 400);
    }

    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true,
    });
    if (authError || !authData?.user) return c.json({ error: 'Failed to create user account' }, 500);
    userId = authData.user.id;
    resolvedName = name;

    const { data: existingProfile } = await db.from('users').select('id').eq('id', userId).maybeSingle();
    if (!existingProfile) {
      const { error: profileError } = await db.from('users').insert({ id: userId, name, email });
      if (profileError) {
        await db.auth.admin.deleteUser(userId);
        return c.json({ error: 'Failed to create user profile' }, 500);
      }
    }
  }

  const { data: member, error: memberError } = await db
    .from('org_members')
    .insert({ user_id: userId, org_id: user.orgId!, role, status: 'active', invited_by: user.memberId! })
    .select('id, role, status, created_at')
    .single();

  if (memberError || !member) {
    console.error('[members/invite]', memberError);
    return c.json({ error: 'Failed to create member' }, 500);
  }

  return c.json({ id: member.id, name: resolvedName, email, role: member.role, status: member.status, created_at: member.created_at }, 201);
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
