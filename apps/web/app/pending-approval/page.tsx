// apps/web/app/pending-approval/page.tsx
// Shown after signup (org status = 'pending') or after login if still not approved.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, AlertCircle, LogOut, RefreshCw, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import Link from 'next/link';
import type { AuthResponse } from '@entriq/shared';

export default function PendingApprovalPage() {
  const router   = useRouter();
  const { user, clearAuth, setAuth, _hasHydrated } = useAuthStore();
  const [checking, setChecking] = useState(false);

  // Auto-refresh token on mount so re-approved orgs are detected immediately on page load/refresh
  useEffect(() => {
    if (!_hasHydrated) return;
    const refreshToken = localStorage.getItem('entriq_refresh_token');
    if (!refreshToken) return;
    api.post<AuthResponse>('/auth/refresh', { refreshToken })
      .then(({ data }) => setAuth(data.token, data.refreshToken, data.user))
      .catch(() => {/* silent — user stays on page */});
  }, [_hasHydrated, setAuth]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user) {
      router.replace('/login');
    } else if (user.orgStatus === 'approved') {
      router.replace('/dashboard');
    }
  }, [_hasHydrated, user, router]);

  if (!_hasHydrated || !user) return null;

  const status = user.orgStatus;

  /** Call /auth/refresh to get a fresh token with up-to-date orgStatus from DB. */
  async function checkStatus() {
    setChecking(true);
    try {
      const refreshToken = localStorage.getItem('entriq_refresh_token');
      if (!refreshToken) {
        clearAuth();
        router.replace('/login');
        return;
      }
      const { data } = await api.post<AuthResponse>('/auth/refresh', { refreshToken });
      setAuth(data.token, data.refreshToken, data.user);
      if (data.user.orgStatus === 'approved') {
        router.replace('/dashboard');
      } else {
        toast.info('Status unchanged — still ' + data.user.orgStatus);
      }
    } catch {
      toast.error('Could not check status. Try again in a moment.');
    } finally {
      setChecking(false);
    }
  }

  const statusConfig = {
    pending: {
      icon:  <Clock className="w-12 h-12 text-yellow-400" />,
      title: 'Awaiting approval',
      body:  'Your organisation has been registered and is pending review by the platform administrator. You will be able to access the dashboard once approved.',
      color: 'border-yellow-500/20 bg-yellow-500/5',
    },
    rejected: {
      icon:  <XCircle className="w-12 h-12 text-red-400" />,
      title: 'Registration rejected',
      body:  'Unfortunately your organisation was not approved. Please contact support if you believe this is a mistake.',
      color: 'border-red-500/20 bg-red-500/5',
    },
    suspended: {
      icon:  <AlertCircle className="w-12 h-12 text-orange-400" />,
      title: 'Account suspended',
      body:  'Your organisation account has been suspended. Please contact support for more information.',
      color: 'border-orange-500/20 bg-orange-500/5',
    },
    approved: null,
  } as const;

  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending;
  if (!cfg) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className={`max-w-md w-full border rounded-2xl p-8 shadow-2xl shadow-black/50 ${cfg.color}`}>
        <div className="flex flex-col items-center text-center gap-4">
          {cfg.icon}

          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{cfg.title}</h1>
            <p className="text-zinc-400 mt-2 text-sm leading-relaxed">{cfg.body}</p>
          </div>

          {status === 'pending' && (
            <div className="w-full mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left space-y-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Your details</p>
              <p className="text-sm text-zinc-300">
                <span className="text-zinc-500">Organisation: </span>{user.orgName}
              </p>
              <p className="text-sm text-zinc-300">
                <span className="text-zinc-500">Email: </span>{user.email}
              </p>
              <p className="text-sm text-zinc-300">
                <span className="text-zinc-500">Role: </span>Admin
              </p>
            </div>
          )}

          <div className="flex gap-3 w-full mt-2">
            {status === 'pending' && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={checkStatus}
                disabled={checking}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Check status'}
              </Button>
            )}
            <Button
              variant="ghost"
              className="flex-1 text-zinc-400 hover:text-zinc-200"
              onClick={() => { clearAuth(); router.push('/login'); }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>

          {/* Always allow access to personal event registrations */}
          <div className="w-full border-t border-zinc-800 pt-4">
            <Button variant="ghost" size="sm" className="w-full text-zinc-500 hover:text-violet-400" asChild>
              <Link href="/my-events">
                <QrCode className="w-4 h-4 mr-2" />
                View my event registrations &amp; QR passes
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
