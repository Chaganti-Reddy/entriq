// apps/api/src/middleware/roles.ts
// Role-based access control middleware.
// Always use AFTER authMiddleware (which attaches `user` to context).

import type { MiddlewareHandler } from 'hono';
import type { AppEnv, MemberRole } from '../types/index.js';
import { db } from '../services/db.js';

/**
 * requireRole('admin') — only org admins may proceed.
 * requireRole('co_organizer') — both admins and co-organizers may proceed.
 * Also enforces that the org is 'approved' before allowing any dashboard action.
 */
export function requireRole(...roles: MemberRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');

    // Super admins bypass all org-level role checks
    if (user.role === 'super_admin') {
      await next();
      return;
    }

    // Must have org context (orgId present in token)
    if (!user.orgId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Org must be approved (event-only members always have orgStatus: 'approved')
    if (user.orgStatus !== 'approved') {
      return c.json(
        {
          error: 'Your organisation is pending approval',
          orgStatus: user.orgStatus,
          code: 'ORG_NOT_APPROVED',
        },
        403
      );
    }

    // Must have the required role
    if (!roles.includes(user.role as MemberRole)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
}

/**
 * requireEventAccess — for routes with :id (event id) param.
 *
 * Access rules (in order):
 *  - super_admin: always passes
 *  - admin (org member): passes — full access to all events in their org
 *  - co_organizer with memberId (org-level): passes — org membership grants all-events access
 *  - isEventMember (event-only, no org_members row): checked against event_members table
 */
export const requireEventAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user    = c.get('user');
  const eventId = c.req.param('id');

  // Super admins bypass
  if (user.role === 'super_admin') { await next(); return; }

  // Must have org context
  if (!user.orgId) return c.json({ error: 'Forbidden' }, 403);
  if (user.orgStatus !== 'approved') {
    return c.json({ error: 'Your organisation is pending approval', code: 'ORG_NOT_APPROVED' }, 403);
  }

  // Admins: full access to all events
  if (user.role === 'admin') { await next(); return; }

  // Org-level co-organizers (have a real org_members row — memberId is set):
  // org membership already grants dashboard access; event_members is additive only.
  if (user.memberId && !user.isEventMember) { await next(); return; }

  // Event-only members: must be assigned to this specific event
  if (!eventId) return c.json({ error: 'Missing event id' }, 400);

  const { data: membership } = await db
    .from('event_members')
    .select('id, role')
    .eq('event_id', eventId)
    .eq('user_id', user.sub)
    .maybeSingle();

  if (!membership) {
    return c.json({ error: 'You are not assigned to this event' }, 403);
  }

  c.set('eventRole' as any, membership.role);
  await next();
};

/**
 * requireSuperAdmin — only super_admin role may proceed.
 */
export const requireSuperAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'super_admin') {
    return c.json({ error: 'Super admin access required' }, 403);
  }
  await next();
};

