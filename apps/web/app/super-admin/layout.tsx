'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Building2, LogOut, ShieldCheck, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSuperAdminStore } from '@/stores/superAdminAuth';
import axios from 'axios';

const navItems = [
  { label: 'Overview',      href: '/super-admin',          icon: LayoutDashboard },
  { label: 'Organisations', href: '/super-admin/orgs',     icon: Building2 },
  { label: 'Users',         href: '/super-admin/users',    icon: Users },
  { label: 'Settings',      href: '/super-admin/settings', icon: Settings },
];

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { isAuthenticated, clearAuth, setAuth, refreshToken, _hasHydrated } = useSuperAdminStore();

  const isLoginPage = pathname === '/super-admin/login';

  // Proactively refresh token on mount to avoid mid-session 401s
  useEffect(() => {
    if (!_hasHydrated || isLoginPage) return;
    const rt = localStorage.getItem('entriq_sa_refresh_token');
    if (!rt) return;
    axios.post(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/auth/refresh`,
      { refreshToken: rt }
    ).then(({ data }) => {
      localStorage.setItem('entriq_sa_token', data.token);
      setAuth(data.token, rt);
    }).catch(() => {
      clearAuth();
      router.replace('/super-admin/login');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated && !isLoginPage) {
      router.replace('/super-admin/login');
    }
  }, [_hasHydrated, isAuthenticated, isLoginPage, router]);

  if (!isAuthenticated && !isLoginPage) return null;
  if (isLoginPage) return <>{children}</>;

  function handleLogout() {
    clearAuth();
    router.push('/super-admin/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <aside className="fixed left-0 top-0 h-screen w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col z-40 hidden md:flex">
        <div className="px-6 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-400" />
            <span className="text-lg font-semibold text-zinc-100">Entriq SA</span>
          </div>
          <p className="text-xs text-zinc-600 mt-0.5">Super Admin Panel</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = href === '/super-admin'
              ? pathname === '/super-admin'
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                  active
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-zinc-800">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>

      <main className="md:ml-60 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

