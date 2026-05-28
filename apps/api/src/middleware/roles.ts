// apps/api/src/middleware/roles.ts
// Role-based access control middleware.
// Always use AFTER authMiddleware (which attaches `user` to context).

import type { MiddlewareHandler } from 'hono';
import type { AppEnv, MemberRole } from '../types/index.js';

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

    // Must be an org member (has memberId in token)
    if (!user.memberId || !user.orgId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Org must be approved
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
 * requireSuperAdmin — only super_admin role may proceed.
 */
export const requireSuperAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'super_admin') {
    return c.json({ error: 'Super admin access required' }, 403);
  }
  await next();
};
