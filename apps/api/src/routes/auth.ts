// apps/api/src/routes/auth.ts
// Phone-first authentication.
// Regular users: phone + bcrypt password (no Supabase Auth).
// Super admins: email + bcrypt (separate table, unchanged).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '../services/db.js';
import { sendOtp, generateOtp } from '../services/sms.js';
import { authLimiter, rateLimiter } from '../middleware/ratelimit.js';
import type { AppEnv } from '../types/index.js';
import type { JWTPayload, OrgStatus, AuthResponse } from '@entriq/shared';
import { getEnv } from '../lib/env.js';

const JWT_SECRET         = () => new TextEncoder().encode(getEnv('JWT_SECRET'));
const JWT_REFRESH_SECRET = () => new TextEncoder().encode(getEnv('JWT_REFRESH_SECRET'));

const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = '30d';
const OTP_TTL_MINUTES   = 10;
const OTP_MAX_ATTEMPTS  = 3;

// ─── Phone validation helper ──────────────────────────────────────────────────
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Enter a valid 10-digit Indian mobile number');

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  phone:   phoneSchema,
  purpose: z.enum(['signup', 'phone_verify', 'forgot_password']),
});

const verifyOtpSchema = z.object({
  phone:   phoneSchema,
  otp:     z.string().length(6).regex(/^\d{6}$/),
  purpose: z.enum(['signup', 'phone_verify', 'forgot_password']),
});

const userSignupSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  phone:    phoneSchema,
  password: z.string().min(8).max(128),
  otp:      z.string().length(6).regex(/^\d{6}$/),
});

const orgSignupSchema = z.object({
  orgName:   z.string().min(2).max(100).trim(),
  adminName: z.string().min(2).max(100).trim(),
  phone:     phoneSchema,
  password:  z.string().min(8).max(128),
  otp:       z.string().length(6).regex(/^\d{6}$/),
});

const loginSchema = z.object({
  phone:    phoneSchema,
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const superAdminLoginSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const resetPasswordSchema = z.object({
  phone:       phoneSchema,
  otp:         z.string().length(6).regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(128),
});

// OTP rate limiter — 5 OTPs per phone per hour
const otpLimiter = rateLimiter(5, '1 h', 'otp');

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    .select('id, name, email, mobile')
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

  // No org membership — check if user has event-level access
  if (!member) {
    const { data: eventAssignments } = await db
      .from('event_members')
      .select('org_id, role')
      .eq('user_id', user.id);

    if (eventAssignments?.length) {
      const { data: orgData } = await db
        .from('orgs')
        .select('id, name, status')
        .eq('id', eventAssignments[0].org_id)
        .maybeSingle();

      if (orgData) {
        const rolePriority: Record<string, number> = { co_organizer: 3, leader: 2, scanner: 1 };
        const effectiveRole = eventAssignments.reduce((best, a) =>
          (rolePriority[a.role] ?? 0) > (rolePriority[best.role] ?? 0) ? a : best
        ).role as 'co_organizer' | 'leader' | 'scanner';

        const payload: JWTPayload = {
          sub:           user.id,
          email:         user.email ?? undefined,
          mobile:        user.mobile ?? undefined,
          name:          user.name,
          role:          effectiveRole,
          orgId:         orgData.id,
          orgName:       orgData.name,
          orgStatus:     'approved',
          isEventMember: true,
        };
        const { token, refreshToken } = await buildTokens(payload, user.id);
        return {
          token,
          refreshToken,
          user: {
            id:            user.id,
            name:          user.name,
            email:         user.email ?? undefined,
            mobile:        user.mobile ?? undefined,
            role:          effectiveRole as any,
            orgId:         orgData.id,
            orgName:       orgData.name,
            orgStatus:     'approved' as const,
            isEventMember: true,
          },
        };
      }
    }
  }

  const payload: JWTPayload = {
    sub:    user.id,
    email:  user.email ?? undefined,
    mobile: user.mobile ?? undefined,
    name:   user.name,
    ...(member && org ? {
      memberId:  member.id,
      role:      member.role as 'admin' | 'co_organizer',
      orgId:     org.id,
      orgName:   org.name,
      orgStatus: org.status as OrgStatus,
    } : {}),
  };
  const { token, refreshToken } = await buildTokens(payload, user.id);

  return {
    token,
    refreshToken,
    user: {
      id:     user.id,
      name:   user.name,
      email:  user.email ?? undefined,
      mobile: user.mobile ?? undefined,
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

/** Validate OTP: checks existence, expiry, attempts. Returns the row id on success or null. */
async function validateOtp(phone: string, otp: string, purpose: string): Promise<{ valid: boolean; error?: string }> {
  const { data: record } = await db
    .from('otp_verifications')
    .select('id, otp_code, expires_at, used, attempts')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record) return { valid: false, error: 'No OTP found. Please request a new one.' };
  if (new Date(record.expires_at) < new Date()) return { valid: false, error: 'OTP has expired. Please request a new one.' };
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { valid: false, error: 'Too many attempts. Please request a new OTP.' };

  if (record.otp_code !== otp) {
    await db.from('otp_verifications').update({ attempts: record.attempts + 1 }).eq('id', record.id);
    return { valid: false, error: 'Incorrect OTP. Please try again.' };
  }

  // Mark as used
  await db.from('otp_verifications').update({ used: true }).eq('id', record.id);
  return { valid: true };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const authRouter = new Hono<AppEnv>();

// POST /auth/send-otp — send an OTP to a phone number
authRouter.post('/send-otp', otpLimiter, zValidator('json', sendOtpSchema), async (c) => {
  const { phone, purpose } = c.req.valid('json');

  // For signup: block if phone already registered
  if (purpose === 'signup') {
    const { data: existing } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();
    if (existing) return c.json({ error: 'An account already exists with this number. Please sign in.' }, 409);
  }

  // For forgot_password / phone_verify: block if phone not found
  if (purpose === 'forgot_password' || purpose === 'phone_verify') {
    const { data: existing } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();
    if (!existing) return c.json({ error: 'No account found with this number.' }, 404);
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  // Invalidate previous unused OTPs for same phone+purpose
  await db.from('otp_verifications')
    .update({ used: true })
    .eq('phone', phone)
    .eq('purpose', purpose)
    .eq('used', false);

  await db.from('otp_verifications').insert({ phone, otp_code: otp, purpose, expires_at: expiresAt });

  try {
    await sendOtp(phone, otp);
  } catch (err: any) {
    console.error('[send-otp] SMS failed', err);
    const msg = err?.smsError ? err.message : 'Failed to send OTP. Please try again.';
    return c.json({ error: msg }, 503);
  }

  return c.json({ ok: true, expiresIn: OTP_TTL_MINUTES * 60 });
});

// POST /auth/verify-otp — verify OTP without completing any action (UI pre-check)
authRouter.post('/verify-otp', authLimiter, zValidator('json', verifyOtpSchema), async (c) => {
  const { phone, otp, purpose } = c.req.valid('json');
  const result = await validateOtp(phone, otp, purpose);
  if (!result.valid) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

// POST /auth/signup — register a participant account (phone + OTP + password)
authRouter.post('/signup', authLimiter, zValidator('json', userSignupSchema), async (c) => {
  const { name, phone, password, otp } = c.req.valid('json');

  // Check duplicate
  const { data: existing } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();
  if (existing) return c.json({ error: 'An account already exists with this number.' }, 409);

  // Validate OTP
  const result = await validateOtp(phone, otp, 'signup');
  if (!result.valid) return c.json({ error: result.error }, 400);

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  const { error: insertErr } = await db.from('users').insert({
    id:                  userId,
    name,
    mobile:              phone,
    mobile_verified:     true,
    mobile_verified_at:  new Date().toISOString(),
    password_hash:       passwordHash,
  });

  if (insertErr) {
    console.error('[signup]', insertErr);
    return c.json({ error: 'Failed to create account. Please try again.' }, 500);
  }

  const res = await buildAuthResponse(userId);
  if (!res) return c.json({ error: 'Account created but login failed. Please sign in.' }, 500);
  return c.json(res, 201);
});

// POST /auth/signup/org — register org admin (phone + OTP + org details)
authRouter.post('/signup/org', authLimiter, zValidator('json', orgSignupSchema), async (c) => {
  const { orgName, adminName, phone, password, otp } = c.req.valid('json');

  // Check duplicate user
  const { data: existingUser } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();
  if (existingUser) return c.json({ error: 'An account already exists with this number.' }, 409);

  // Validate OTP
  const result = await validateOtp(phone, otp, 'signup');
  if (!result.valid) return c.json({ error: result.error }, 400);

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  // Insert user
  const { error: userErr } = await db.from('users').insert({
    id:                 userId,
    name:               adminName,
    mobile:             phone,
    mobile_verified:    true,
    mobile_verified_at: new Date().toISOString(),
    password_hash:      passwordHash,
  });
  if (userErr) {
    console.error('[signup/org] user insert', userErr);
    return c.json({ error: 'Failed to create account.' }, 500);
  }

  // Create org (pending approval)
  const { data: org, error: orgErr } = await db
    .from('orgs')
    .insert({ name: orgName, status: 'pending' })
    .select('id, name, status')
    .single();
  if (orgErr || !org) {
    await db.from('users').delete().eq('id', userId);
    return c.json({ error: 'Failed to create organisation.' }, 500);
  }

  // Create admin org_member
  const { data: member, error: memberErr } = await db
    .from('org_members')
    .insert({ user_id: userId, org_id: org.id, role: 'admin', status: 'active' })
    .select('id, role')
    .single();
  if (memberErr || !member) {
    await db.from('users').delete().eq('id', userId);
    await db.from('orgs').delete().eq('id', org.id);
    return c.json({ error: 'Failed to create admin role.' }, 500);
  }

  const res = await buildAuthResponse(userId);
  if (!res) return c.json({ error: 'Account created. Please sign in.' }, 500);
  return c.json(res, 201);
});

// POST /auth/login — phone + password login
authRouter.post('/login', authLimiter, zValidator('json', loginSchema), async (c) => {
  const { phone, password } = c.req.valid('json');

  const { data: user } = await db
    .from('users')
    .select('id, name, mobile, mobile_verified, password_hash')
    .eq('mobile', phone)
    .maybeSingle();

  if (!user) return c.json({ error: 'Invalid phone number or password.' }, 401);
  if (!user.mobile_verified) {
    return c.json({ error: 'Your phone number is not verified.', requiresPhoneVerification: true }, 403);
  }
  if (!user.password_hash) {
    return c.json({ error: 'Password not set. Please use forgot password to set one.', requiresPhoneVerification: true }, 403);
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return c.json({ error: 'Invalid phone number or password.' }, 401);

  const res = await buildAuthResponse(user.id);
  if (!res) return c.json({ error: 'Login failed. Please try again.' }, 500);
  return c.json(res);
});

// POST /auth/forgot-password — step 1: send OTP to phone
authRouter.post('/forgot-password', authLimiter, zValidator('json', z.object({ phone: phoneSchema })), async (c) => {
  const { phone } = c.req.valid('json');
  // Always 200 to prevent phone enumeration, but only actually send if user exists
  const { data: user } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();

  if (user) {
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
    await db.from('otp_verifications')
      .update({ used: true })
      .eq('phone', phone).eq('purpose', 'forgot_password').eq('used', false);
    await db.from('otp_verifications').insert({ phone, otp_code: otp, purpose: 'forgot_password', expires_at: expiresAt });
    try { await sendOtp(phone, otp); } catch (e) { console.error('[forgot-password] SMS failed', e); }
  }

  return c.json({ ok: true });
});

// POST /auth/reset-password — step 2: verify OTP + set new password
authRouter.post('/reset-password', authLimiter, zValidator('json', resetPasswordSchema), async (c) => {
  const { phone, otp, newPassword } = c.req.valid('json');

  const result = await validateOtp(phone, otp, 'forgot_password');
  if (!result.valid) return c.json({ error: result.error }, 400);

  const { data: user } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();
  if (!user) return c.json({ error: 'Account not found.' }, 404);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.from('users').update({ password_hash: passwordHash }).eq('id', user.id);

  const res = await buildAuthResponse(user.id);
  if (!res) return c.json({ error: 'Password reset. Please sign in.' }, 500);
  return c.json(res);
});

// POST /auth/verify-phone — verify phone OTP + set password (for existing users migrating to phone auth)
// Uses 'phone_verify' OTP purpose — different from forgot_password because it also sets mobile_verified
authRouter.post('/verify-phone', authLimiter, zValidator('json', resetPasswordSchema), async (c) => {
  const { phone, otp, newPassword } = c.req.valid('json');

  const result = await validateOtp(phone, otp, 'phone_verify');
  if (!result.valid) return c.json({ error: result.error }, 400);

  const { data: user } = await db.from('users').select('id').eq('mobile', phone).maybeSingle();
  if (!user) return c.json({ error: 'Account not found.' }, 404);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.from('users').update({
    password_hash:      passwordHash,
    mobile_verified:    true,
    mobile_verified_at: new Date().toISOString(),
  }).eq('id', user.id);

  const res = await buildAuthResponse(user.id);
  if (!res) return c.json({ error: 'Phone verified. Please sign in.' }, 500);
  return c.json(res);
});

// GET /auth/phone-check — check if a phone number has a verified Entriq account
// Used by event registration to gate access
authRouter.get('/phone-check', async (c) => {
  const phone = c.req.query('phone');
  if (!phone || !/^\d{10}$/.test(phone)) return c.json({ error: 'phone query param required (10 digits)' }, 400);

  const { data: user } = await db
    .from('users')
    .select('id, name, mobile_verified')
    .eq('mobile', phone)
    .maybeSingle();

  if (!user) return c.json({ exists: false });
  return c.json({ exists: true, verified: user.mobile_verified, name: user.name });
});

// POST /auth/super-admin/login — email + bcrypt (super admin only, unchanged)
authRouter.post('/super-admin/login', authLimiter, zValidator('json', superAdminLoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const { data: sa } = await db
    .from('super_admins')
    .select('id, name, email, password_hash')
    .eq('email', email)
    .maybeSingle();

  if (!sa || !sa.password_hash) return c.json({ error: 'Invalid email or password' }, 401);

  const match = await bcrypt.compare(password, sa.password_hash);
  if (!match) return c.json({ error: 'Invalid email or password' }, 401);

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

// POST /auth/refresh — rotate JWT
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
