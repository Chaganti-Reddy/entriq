// apps/api/src/routes/checkins.ts
// Check-in routes: lookup a registration by unique code and approve entry.
// GET is public (scan page loads details). POST requires admin password.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../services/db.js';
import { checkinLimiter } from '../middleware/ratelimit.js';
import type { AppEnv } from '../types/index.js';

// ─── Validation ────────────────────────────────────────────────────────────────

const approveSchema = z.object({
  adminPassword: z.string().min(1).max(100),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const checkinRouter = new Hono<AppEnv>();

// GET /checkin/:uniqueCode — fetch registration details for scan page (public)
checkinRouter.get('/:uniqueCode', async (c) => {
  const { uniqueCode } = c.req.param();

  const { data: registration, error } = await db
    .from('registrations')
    .select('id, event_id, email, name, surname, state, city, mobile, profession, unique_code, status, registered_at')
    .eq('unique_code', uniqueCode)
    .maybeSingle();

  if (error) {
    return c.json({ error: 'Lookup failed' }, 500);
  }

  if (!registration) {
    return c.json({ error: 'Invalid QR code', code: 'NOT_FOUND' }, 404);
  }

  // Fetch event details (without admin_password)
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, name, date, location, slug, is_active')
    .eq('id', registration.event_id)
    .maybeSingle();

  if (eventError || !event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  // If already approved, also return the approval time
  let approvedAt: string | null = null;
  if (registration.status === 'approved') {
    const { data: checkin } = await db
      .from('checkins')
      .select('approved_at')
      .eq('registration_id', registration.id)
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    approvedAt = checkin?.approved_at ?? null;
  }

  return c.json({ registration, event, approvedAt });
});

// POST /checkin/:uniqueCode — approve entry (requires admin password, rate-limited)
checkinRouter.post(
  '/:uniqueCode',
  checkinLimiter,
  zValidator('json', approveSchema),
  async (c) => {
    const { uniqueCode } = c.req.param();
    const { adminPassword } = c.req.valid('json');

    // Fetch registration
    const { data: registration, error: regError } = await db
      .from('registrations')
      .select('id, event_id, name, surname, status')
      .eq('unique_code', uniqueCode)
      .maybeSingle();

    if (regError) {
      return c.json({ ok: false, error: 'Lookup failed' }, 500);
    }

    if (!registration) {
      return c.json({ ok: false, error: 'Invalid QR code', code: 'NOT_FOUND' }, 404);
    }

    // Already approved — return idempotent response
    if (registration.status === 'approved') {
      const { data: checkin } = await db
        .from('checkins')
        .select('approved_at')
        .eq('registration_id', registration.id)
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return c.json(
        {
          ok: false,
          alreadyApproved: true,
          name: `${registration.name} ${registration.surname}`,
          approvedAt: checkin?.approved_at ?? null,
        },
        200
      );
    }

    // Fetch event to verify admin password
    const { data: event, error: eventError } = await db
      .from('events')
      .select('id, admin_password, is_active')
      .eq('id', registration.event_id)
      .maybeSingle();

    if (eventError || !event) {
      return c.json({ ok: false, error: 'Event not found' }, 404);
    }

    // bcrypt.compare is timing-safe and handles the hashed password comparison.
    const passwordMatch = await bcrypt.compare(adminPassword, event.admin_password);

    if (!passwordMatch) {
      // Use 422 (not 401) so the frontend axios interceptor doesn't
      // mistake this for an expired JWT and try to redirect to /login.
      return c.json({ ok: false, error: 'Wrong password' }, 422);
    }

    // Update registration status atomically — only succeeds if still 'not_approved'.
    // This prevents a TOCTOU race where two admins scan the same QR simultaneously.
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await db
      .from('registrations')
      .update({ status: 'approved' })
      .eq('id', registration.id)
      .eq('status', 'not_approved') // atomic guard — only wins the race if still pending
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('[checkin/approve update]', updateError);
      return c.json({ ok: false, error: 'Failed to approve entry' }, 500);
    }

    // If updated is null, another request won the race and already approved this QR
    if (!updated) {
      const { data: checkin } = await db
        .from('checkins')
        .select('approved_at')
        .eq('registration_id', registration.id)
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return c.json(
        {
          ok: false,
          alreadyApproved: true,
          name: `${registration.name} ${registration.surname}`,
          approvedAt: checkin?.approved_at ?? now,
        },
        200
      );
    }

    const { error: checkinError } = await db.from('checkins').insert({
      registration_id: registration.id,
      event_id: registration.event_id,
      approved_at: now,
      approved_by: 'Admin',
    });

    if (checkinError) {
      // Non-fatal: registration is already approved, just log the error
      console.error('[checkin/audit log]', checkinError);
    }

    return c.json({
      ok: true,
      name: `${registration.name} ${registration.surname}`,
      approvedAt: now,
    });
  }
);
