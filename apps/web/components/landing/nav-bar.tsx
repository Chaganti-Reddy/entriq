// components/landing/nav-bar.tsx
// Smart navbar: reads auth state — shows Dashboard if logged in, Login/Signup if not.
// Extracted as a client component so the landing page (server) stays fast.

'use client';

import Link from 'next/link';
import { Gem, LayoutDashboard, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'next/navigation';

export function NavBar() {
  const { user, isAuthenticated, _hasHydrated, clearAuth } = useAuthStore();
  const router = useRouter();

  const logoHref = isAuthenticated ? '/dashboard' : '/';

  function handleLogout() {
    clearAuth();
    router.push('/');
  }

  return (
    <header className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo — goes to dashboard if logged in */}
          <Link href={logoHref} className="flex items-center gap-2">
            <Gem className="w-5 h-5 text-violet-500" />
            <span className="font-semibold text-zinc-100 text-lg">Entriq</span>
          </Link>

          {/* Right side — don't render until hydrated to avoid flash */}
          {!_hasHydrated ? (
            <div className="w-32 h-8 rounded-lg bg-zinc-800/50 animate-pulse" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-zinc-200">{user.name}</span>
                <span className="text-[11px] text-zinc-500">{user.orgName ?? user.email}</span>
              </div>
              <Button size="sm" asChild className="bg-violet-600 hover:bg-violet-500 text-white">
                <Link href="/dashboard">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
              </Button>
              <button
                onClick={handleLogout}
                title="Log out"
                className="text-zinc-500 hover:text-red-400 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
