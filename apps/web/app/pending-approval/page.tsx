// apps/web/app/pending-approval/page.tsx
// Shown after signup (org status = 'pending') or after login if still not approved.
// Also shows any active event assignments so scanner/co-organizer roles remain accessible.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock, XCircle, AlertCircle, LogOut, RefreshCw, QrCode,
  ScanLine, ShieldCheck, ArrowRight, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { formatDateShort } from '@/lib/utils';
import type { AuthResponse } from '@entriq/shared';

interface EventAssignment {
  id: string;
  role: 'co_organizer' | 'scanner';
  event: { id: string; name: string; date: string | null; location: string | null; is_active: boolean };
  org: { id: string; name: string };
}

export default function PendingApprovalPage() {
  const router   = useRouter();
  const { user, clearAuth, setAuth, _hasHydrated } = useAuthStore();
  const [checking, setChecking] = useState(false);

  // ── Fetch event assignments so the user can still access scanner/co-org events ──
  const { data: assignments } = useQuery<EventAssignment[]>({
    queryKey: ['event-assignments-pending'],
    queryFn:  async () => { const { data } = await api.get('/user/event-assignments'); return data; },
    enabled:  !!user,
  });

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
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start p-4 pt-12">
      {/* ── Status card ── */}
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
                <span className="text-zinc-500">Mobile: </span>{user.mobile ? `+91 ${user.mobile}` : (user.email ?? '—')}
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

      {/* ── Event assignments — so scanner/co-organizer access is never blocked ── */}
      {assignments && assignments.length > 0 && (
        <div className="max-w-md w-full mt-6">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-300">Your Event Assignments</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            You can still access these events while your organisation approval is pending.
          </p>
          <div className="space-y-3">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-zinc-200">{a.event?.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      a.role === 'co_organizer'
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {a.role === 'co_organizer'
                        ? <><ShieldCheck className="w-3 h-3 inline mr-1" />Co-organizer</>
                        : <><ScanLine className="w-3 h-3 inline mr-1" />Scanner</>}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {a.org?.name}
                    {a.event?.date && ` · 📅 ${formatDateShort(a.event.date)}`}
                    {a.event?.location && ` · 📍 ${a.event.location}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-zinc-200 shrink-0" asChild>
                  {a.role === 'scanner' ? (
                    <Link href={`/dashboard/events/${a.event?.id}/scan`}>
                      <ScanLine className="w-4 h-4" />
                    </Link>
                  ) : (
                    <Link href={`/dashboard/events/${a.event?.id}`}>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
