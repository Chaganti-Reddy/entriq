// apps/api/src/routes/user.ts
// User-specific routes: profile, password, org settings, registrations, create org.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import type { AppEnv } from '../types/index.js';
import type { AuthResponse, OrgStatus } from '@entriq/shared';
import jwt from 'jsonwebtoken';

const JWT_SECRET         = () => process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET!;

export const userRouter = new Hono<AppEnv>();

// GET /user/registrations — returns all registrations for the logged-in user
userRouter.get('/registrations', authMiddleware, async (c) => {
  const user = c.get('user');

  const { data, error } = await db
    .from('registrations')
    .select(`
      id,
      unique_code,
      status,
      registered_at,
      events (
        id,
        name,
        slug,
        date,
        location,
        is_active
      )
    `)
    .eq('user_id', user.sub)
    .order('registered_at', { ascending: false });

  if (error) {
    console.error('[user/registrations]', error);
    return c.json({ error: 'Failed to fetch registrations' }, 500);
  }

  const normalized = (data ?? []).map(({ events, ...rest }) => ({
    ...rest,
    event: events,
  }));

  return c.json(normalized);
});

// PATCH /user/profile — update display name, re-issues JWT
userRouter.patch(
  '/profile',
  authMiddleware,
  zValidator('json', z.object({ name: z.string().min(2).max(100).trim() })),
  async (c) => {
    const user = c.get('user');
    const { name } = c.req.valid('json');

    const { error } = await db.from('users').update({ name }).eq('id', user.sub);
    if (error) {
      console.error('[user/profile]', error);
      return c.json({ error: 'Failed to update profile' }, 500);
    }

    // Re-issue JWT with updated name
    const payload = {
      sub: user.sub, email: user.email, name,
      ...(user.memberId && {
        memberId: user.memberId, role: user.role,
        orgId: user.orgId, orgName: user.orgName, orgStatus: user.orgStatus,
      }),
    };
    const token        = jwt.sign(payload, JWT_SECRET(), { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.sub, type: 'refresh' }, JWT_REFRESH_SECRET(), { expiresIn: '30d' });

    const res: AuthResponse = {
      token, refreshToken,
      user: { id: user.sub, email: user.email, name, ...(user.memberId && {
        memberId: user.memberId, role: user.role as 'admin',
        orgId: user.orgId, orgName: user.orgName, orgStatus: user.orgStatus as OrgStatus,
      })},
    };

    return c.json(res);
  }
);

// PATCH /user/password — change password via Supabase admin
userRouter.patch(
  '/password',
  authMiddleware,
  zValidator('json', z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(8).max(128),
  })),
  async (c) => {
    const user = c.get('user');
    const { currentPassword, newPassword } = c.req.valid('json');

    // Verify current password by attempting a sign-in
    const { error: signInErr } = await db.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInErr) return c.json({ error: 'Current password is incorrect' }, 400);

    // Update via admin API
    const { error: updateErr } = await db.auth.admin.updateUserById(user.sub, {
      password: newPassword,
    });
    if (updateErr) {
      console.error('[user/password]', updateErr);
      return c.json({ error: 'Failed to update password' }, 500);
    }

    return c.json({ ok: true });
  }
);

// PATCH /user/org — update org name + contact email (admin only)
userRouter.patch(
  '/org',
  authMiddleware,
  requireRole('admin'),
  zValidator('json', z.object({
    orgName:      z.string().min(2).max(100).trim().optional(),
    contactEmail: z.string().email().toLowerCase().trim().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    if (!body.orgName && !body.contactEmail) {
      return c.json({ error: 'Nothing to update' }, 400);
    }

    // Check email uniqueness if changing
    if (body.contactEmail) {
      const { data: taken } = await db
        .from('orgs').select('id').eq('email', body.contactEmail).maybeSingle();
      if (taken && taken.id !== user.orgId) {
        return c.json({ error: 'That contact email is already used by another organisation' }, 409);
      }
    }

    const updates: Record<string, string> = {};
    if (body.orgName)      updates.name  = body.orgName;
    if (body.contactEmail) updates.email = body.contactEmail;

    const { data: org, error } = await db
      .from('orgs').update(updates).eq('id', user.orgId!).select('id, name, email').single();

    if (error || !org) {
      console.error('[user/org]', error);
      return c.json({ error: 'Failed to update organisation' }, 500);
    }

    // Re-issue JWT with updated orgName
    const newOrgName = body.orgName ?? user.orgName;
    const payload = {
      sub: user.sub, email: user.email, name: user.name,
      memberId: user.memberId, role: user.role,
      orgId: user.orgId, orgName: newOrgName, orgStatus: user.orgStatus,
    };
    const token        = jwt.sign(payload, JWT_SECRET(), { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: user.sub, type: 'refresh' }, JWT_REFRESH_SECRET(), { expiresIn: '30d' });

    const res: AuthResponse = {
      token, refreshToken,
      user: {
        id: user.sub, email: user.email, name: user.name,
        memberId: user.memberId, role: user.role as 'admin',
        orgId: user.orgId, orgName: newOrgName, orgStatus: user.orgStatus as OrgStatus,
      },
    };

    return c.json(res);
  }
);

// POST /user/create-org — existing participant creates a new organisation (pending approval)
userRouter.post(
  '/create-org',
  authMiddleware,
  zValidator('json', z.object({
    orgName:      z.string().min(2).max(100).trim(),
    contactEmail: z.string().email().toLowerCase().trim(),
  })),
  async (c) => {
    const { sub: userId, email, name } = c.get('user');
    const { orgName, contactEmail }    = c.req.valid('json');

    const { data: existing } = await db
      .from('org_members').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle();
    if (existing) return c.json({ error: 'You already belong to an organisation' }, 409);

    const { data: emailTaken } = await db
      .from('orgs').select('id').eq('email', contactEmail).maybeSingle();
    if (emailTaken) return c.json({ error: 'An organisation with this contact email already exists' }, 409);

    const { data: org, error: orgErr } = await db
      .from('orgs').insert({ name: orgName, email: contactEmail, status: 'pending' })
      .select('id, name, status').single();
    if (orgErr || !org) {
      console.error('[user/create-org] org insert', orgErr);
      return c.json({ error: 'Failed to create organisation' }, 500);
    }

    const { data: member, error: memberErr } = await db
      .from('org_members').insert({ user_id: userId, org_id: org.id, role: 'admin', status: 'active' })
      .select('id, role').single();
    if (memberErr || !member) {
      console.error('[user/create-org] member insert', memberErr);
      await db.from('orgs').delete().eq('id', org.id);
      return c.json({ error: 'Failed to create organisation' }, 500);
    }

    const payload = {
      sub: userId, email, name,
      memberId: member.id, role: member.role,
      orgId: org.id, orgName: org.name, orgStatus: org.status as OrgStatus,
    };
    const token        = jwt.sign(payload, JWT_SECRET(), { expiresIn: '15m' });
    const refreshToken = jwt.sign({ sub: userId, type: 'refresh' }, JWT_REFRESH_SECRET(), { expiresIn: '30d' });

    const res: AuthResponse = {
      token, refreshToken,
      user: {
        id: userId, email, name,
        memberId: member.id, role: member.role as 'admin',
        orgId: org.id, orgName: org.name, orgStatus: org.status as OrgStatus,
      },
    };

    return c.json(res, 201);
  }
);


