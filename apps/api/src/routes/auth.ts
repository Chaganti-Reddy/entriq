// apps/api/src/routes/auth.ts
// Authentication: Supabase Auth for email/password + our custom JWT for org role info.
// Super admin uses a separate bcrypt-based flow (not in auth.users).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { db, anonDb } from '../services/db.js';
import { authLimiter } from '../middleware/ratelimit.js';
import type { AppEnv } from '../types/index.js';
import type { JWTPayload, OrgStatus, AuthResponse } from '@entriq/shared';
import { getEnv } from '../lib/env.js';

const JWT_SECRET         = () => new TextEncoder().encode(getEnv('JWT_SECRET'));
const JWT_REFRESH_SECRET = () => new TextEncoder().encode(getEnv('JWT_REFRESH_SECRET'));
const APP_URL            = () => getEnv('FRONTEND_URL') || 'http://localhost:3000';

const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = '30d';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const userSignupSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  email:    z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
});

const orgSignupSchema = z.object({
  orgName:   z.string().min(2).max(100).trim(),
  adminName: z.string().min(2).max(100).trim(),
  email:     z.string().email().toLowerCase().trim(),
  password:  z.string().min(8).max(128),
});

const loginSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const exchangeSchema = z.object({
  accessToken: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const superAdminLoginSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserPayload(
  user: { id: string; email: string; name: string },
  member?: { id: string; role: string; org_id: string } | null,
  org?: { id: string; name: string; status: string } | null,
): JWTPayload {
  const payload: JWTPayload = { sub: user.id, email: user.email, name: user.name };
  if (member && org) {
    payload.memberId  = member.id;
    payload.role      = member.role as 'admin' | 'co_organizer';
    payload.orgId     = org.id;
    payload.orgName   = org.name;
    payload.orgStatus = org.status as OrgStatus;
  }
  return payload;
}

async function buildTokens(payload: JWTPayload, refreshSub: string, refreshType = 'refresh') {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(JWT_SECRET());
  const refreshToken = await new SignJWT({ sub: refreshSub, type: refreshType })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(JWT_REFRESH_SECRET());
  return { token, refreshToken };
}

async function buildAuthResponse(userId: string): Promise<AuthResponse | null> {
  const { data: user } = await db
    .from('users')
    .select('id, name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return null;

  const { data: member } = await db
    .from('org_members')
    .select('id, role, status, org_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  let org = null;
  if (member) {
    const { data: orgData } = await db
      .from('orgs')
      .select('id, name, status')
      .eq('id', member.org_id)
      .maybeSingle();
    org = orgData;
  }

  const payload = buildUserPayload(user, member ?? null, org);
  const { token, refreshToken } = await buildTokens(payload, user.id);

  return {
    token,
    refreshToken,
    user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
      ...(member && org ? {
        memberId:  member.id,
        role:      member.role as 'admin' | 'co_organizer',
        orgId:     org.id,
        orgName:   org.name,
        orgStatus: org.status as OrgStatus,
      } : {}),
    },
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const authRouter = new Hono<AppEnv>();

// POST /auth/signup — register a participant account
// Supabase Auth sends a verification email. Returns emailVerificationRequired: true
// unless Supabase has email confirm disabled (dev mode).
authRouter.post('/signup', authLimiter, zValidator('json', userSignupSchema), async (c) => {
  const { name, email, password } = c.req.valid('json');

  const { data, error } = await anonDb.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${APP_URL()}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return c.json({ error: 'An account with this email already exists' }, 409);
    }
    console.error('[signup]', error);
    return c.json({ error: error.message }, 400);
  }

  if (!data.user) return c.json({ error: 'Signup failed' }, 500);

  const userId = data.user.id;

  // Ensure user profile exists — trigger may be delayed or failed
  await db.from('users').upsert(
    { id: userId, name, email },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  // Dev mode: email confirm disabled — Supabase auto-confirmed the user
  if (data.user.email_confirmed_at && data.session) {
    const res = await buildAuthResponse(userId);
    if (!res) return c.json({ error: 'Profile not found' }, 500);
    return c.json(res, 201);
  }

  // Production: email verification required
  return c.json({ ok: true, emailVerificationRequired: true, email }, 201);
});

// POST /auth/signup/org — register user + org (pending approval)
authRouter.post('/signup/org', authLimiter, zValidator('json', orgSignupSchema), async (c) => {
  const { orgName, adminName, email, password } = c.req.valid('json');

  // Check org email uniqueness
  const { data: existingOrg } = await db
    .from('orgs')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingOrg) return c.json({ error: 'An organisation with this email already exists' }, 409);

  // Create Supabase auth user
  const { data, error: signupError } = await anonDb.auth.signUp({
    email,
    password,
    options: {
      data: { name: adminName },
      emailRedirectTo: `${APP_URL()}/auth/callback`,
    },
  });

  if (signupError) {
    if (signupError.message.toLowerCase().includes('already registered')) {
      return c.json({ error: 'An account with this email already exists' }, 409);
    }
    console.error('[signup/org]', signupError);
    return c.json({ error: signupError.message }, 400);
  }

  if (!data.user) return c.json({ error: 'Signup failed' }, 500);

  const userId = data.user.id;

  // If trigger hasn't run yet (race condition edge case), insert profile manually
  const { data: existingProfile } = await db.from('users').select('id').eq('id', userId).maybeSingle();
  if (!existingProfile) {
    await db.from('users').insert({ id: userId, name: adminName, email }).select().single();
  }

  // Create org (pending approval)
  const { data: org, error: orgError } = await db
    .from('orgs')
    .insert({ name: orgName, email, status: 'pending' })
    .select('id, name, status')
    .single();
  if (orgError || !org) {
    await db.auth.admin.deleteUser(userId);
    return c.json({ error: 'Failed to create organisation' }, 500);
  }

  // Create admin org_member entry
  const { data: member, error: memberError } = await db
    .from('org_members')
    .insert({ user_id: userId, org_id: org.id, role: 'admin', status: 'active' })
    .select('id, role')
    .single();
  if (memberError || !member) {
    await db.auth.admin.deleteUser(userId);
    await db.from('orgs').delete().eq('id', org.id);
    return c.json({ error: 'Failed to create admin role' }, 500);
  }

  // Dev mode: auto-confirmed
  if (data.user.email_confirmed_at && data.session) {
    const payload = buildUserPayload(
      { id: userId, name: adminName, email },
      { id: member.id, role: member.role, org_id: org.id },
      { id: org.id, name: org.name, status: 'pending' },
    );
    const { token, refreshToken } = await buildTokens(payload, userId);
    return c.json({
      token, refreshToken,
      user: { id: userId, name: adminName, email, memberId: member.id, role: member.role, orgId: org.id, orgName: org.name, orgStatus: 'pending' },
    }, 201);
  }

  // Production: email verification required
  return c.json({ ok: true, emailVerificationRequired: true, email, orgPending: true }, 201);
});

// POST /auth/login — unified login (participant or org member)
// Supabase verifies password + email confirmation status.
authRouter.post('/login', authLimiter, zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const { data, error } = await anonDb.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message === 'Email not confirmed') {
      return c.json({ error: 'Please verify your email first. Check your inbox for the verification link.' }, 403);
    }
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  if (!data.user) return c.json({ error: 'Login failed' }, 500);

  // Sign out of the Supabase session — we manage sessions ourselves with our JWT
  await anonDb.auth.signOut();

  const res = await buildAuthResponse(data.user.id);
  if (!res) return c.json({ error: 'User profile not found' }, 404);

  return c.json(res);
});

// POST /auth/exchange — exchange a Supabase access token for our JWT
// Called by /auth/callback page after email verification.
authRouter.post('/exchange', authLimiter, zValidator('json', exchangeSchema), async (c) => {
  const { accessToken } = c.req.valid('json');

  // Verify the Supabase token
  const { data: { user: authUser }, error } = await db.auth.getUser(accessToken);
  if (error || !authUser) return c.json({ error: 'Invalid or expired token' }, 401);

  // Wait briefly for the DB trigger to fire if needed
  let res = await buildAuthResponse(authUser.id);
  if (!res) {
    // Trigger may be slightly delayed — insert profile manually as fallback
    await db.from('users').upsert({
      id:    authUser.id,
      name:  authUser.user_metadata?.name ?? authUser.email?.split('@')[0] ?? 'User',
      email: authUser.email!,
    }, { onConflict: 'id', ignoreDuplicates: true });
    res = await buildAuthResponse(authUser.id);
  }

  if (!res) return c.json({ error: 'User profile not found' }, 404);
  return c.json(res);
});

// POST /auth/super-admin/login — super admin login (separate token space, bcrypt)
authRouter.post('/super-admin/login', authLimiter, zValidator('json', superAdminLoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const { data: sa } = await db
    .from('super_admins')
    .select('id, name, email, password_hash')
    .eq('email', email)
    .maybeSingle();
  if (!sa) return c.json({ error: 'Invalid email or password' }, 401);

  const valid = await bcrypt.compare(password, sa.password_hash);
  if (!valid) return c.json({ error: 'Invalid email or password' }, 401);

  const payload: JWTPayload = { sub: sa.id, email: sa.email, name: sa.name, role: 'super_admin' };
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(JWT_SECRET());
  const refreshToken = await new SignJWT({ sub: sa.id, type: 'refresh_sa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(JWT_REFRESH_SECRET());

  return c.json({ token, refreshToken, admin: { id: sa.id, name: sa.name, email: sa.email } });
});

// POST /auth/refresh — rotate our JWT (re-fetches org status from DB)
authRouter.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');
  try {
    const { payload: decoded } = await jwtVerify(refreshToken, JWT_REFRESH_SECRET());
    const sub  = decoded.sub as string;
    const type = decoded['type'] as string;

    if (type === 'refresh_sa') {
      const { data: sa } = await db.from('super_admins').select('id, name, email').eq('id', sub).maybeSingle();
      if (!sa) return c.json({ error: 'Account not found' }, 401);
      const payload: JWTPayload = { sub: sa.id, email: sa.email, name: sa.name, role: 'super_admin' };
      const accessToken = await new SignJWT(payload as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_TTL)
        .sign(JWT_SECRET());
      return c.json({ token: accessToken });
    }

    const res = await buildAuthResponse(sub);
    if (!res) return c.json({ error: 'Account not found' }, 401);

    return c.json(res);
  } catch {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }
});
