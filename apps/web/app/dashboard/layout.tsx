// apps/web/app/dashboard/layout.tsx
// Dashboard shell: fixed sidebar + main content area. Mobile: bottom nav.
// Role-aware: shows Team link for admins only, hides write actions for co-organizers.

'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Settings2, LogOut, Gem, Users, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { AuthResponse } from '@entriq/shared';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, clearAuth, setAuth, _hasHydrated } = useAuthStore();

  // Guard: redirect if not authenticated or org not approved
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user && user.orgStatus !== 'approved') {
      router.replace('/pending-approval');
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  // Poll token every 5 minutes to catch suspension/rejection in near real-time
  const refreshOrgStatus = useCallback(async () => {
    const refreshToken = localStorage.getItem('entriq_refresh_token');
    if (!refreshToken) return;
    try {
      const { data } = await api.post<AuthResponse>('/auth/refresh', { refreshToken });
      setAuth(data.token, data.refreshToken, data.user);
      // The useEffect above will redirect if orgStatus changed to non-approved
    } catch {
      // ignore — interceptor handles real errors
    }
  }, [setAuth]);

  useEffect(() => {
    // Check immediately on mount, then every 5 minutes
    refreshOrgStatus();
    const interval = setInterval(refreshOrgStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshOrgStatus]);

  if (!_hasHydrated || !isAuthenticated || !user) return null;

  const isAdmin       = user.role === 'admin';
  const isEventMember = (user as any).isEventMember === true;

  const navItems = [
    { label: 'Events',    href: '/dashboard',      icon: CalendarDays },
    ...(isAdmin ? [{ label: 'Team', href: '/dashboard/team', icon: Users }] : []),
    ...(!isEventMember ? [{ label: 'Settings', href: '/dashboard/settings', icon: Settings2 }] : []),
  ];

  const externalLinks = [
    { label: 'My Events', href: '/my-events', icon: QrCode },
  ];

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ── Desktop Sidebar ── */}
      <aside className="fixed left-0 top-0 h-screen w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col z-40 hidden md:flex">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-zinc-800">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <Gem className="w-5 h-5 text-violet-500 group-hover:text-violet-400 transition-colors" />
            <span className="text-lg font-semibold text-zinc-100">Entriq</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                  active
                    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}

          {/* Divider + personal links */}
          <div className="pt-2 mt-2 border-t border-zinc-800">
            {externalLinks.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Member info + role badge + Logout */}
        <div className="px-3 py-4 border-t border-zinc-800 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-xs text-zinc-500">
                {isEventMember ? 'Event access via' : 'Organisation'}
              </p>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-medium capitalize',
                user.role === 'admin'
                  ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                  : user.role === 'co_organizer'
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                    : user.role === 'leader'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      : user.role === 'scanner'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-700/40 text-zinc-400 border border-zinc-700'
              )}>
                {user.role === 'co_organizer' ? 'Co-org' : (user.role ?? 'Member')}
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-100 truncate">{user.orgName ?? '—'}</p>
            <p className="text-xs text-zinc-500 truncate">{user.mobile ? `+91 ${user.mobile}` : (user.email ?? '')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="md:ml-60 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 flex md:hidden z-40">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors',
                active ? 'text-violet-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
        {externalLinks.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-xs text-zinc-500 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </nav>
    </div>
  );
}

