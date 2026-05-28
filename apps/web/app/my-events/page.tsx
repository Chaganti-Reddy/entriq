// apps/web/app/my-events/page.tsx
// My Events — shows all registrations for the logged-in user with client-side QR codes.
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Gem, Calendar, MapPin, QrCode, CheckCircle2, BadgeCheck, Loader2, LogOut, Building2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import Link from 'next/link';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface UserRegistration {
  id: string;
  unique_code: string;
  status: 'not_approved' | 'approved';
  registered_at: string;
  event: {
    id: string;
    name: string;
    slug: string;
    date: string | null;
    location: string | null;
    is_active: boolean;
  };
}

// ─── QR canvas component ──────────────────────────────────────────────────────

function QRCanvas({ value, greyed }: { value: string; greyed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: 220,
      margin: 2,
      color: {
        dark:  greyed ? '#a1a1aa' : '#18181b',   // dark modules
        light: greyed ? '#3f3f46' : '#ffffff',    // white background when active
      },
    }).catch(console.error);
  }, [value, greyed]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl border border-zinc-300 mx-auto block"
    />
  );
}

// ─── Single registration card ─────────────────────────────────────────────────

function RegistrationCard({ reg }: { reg: UserRegistration }) {
  const [expanded, setExpanded] = useState(false);
  const isCheckedIn = reg.status === 'approved';
  const scanUrl     = `${APP_URL}/scan/${reg.unique_code}`;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-start justify-between p-5 cursor-pointer hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-zinc-100">{reg.event.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
              isCheckedIn
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
            }`}>
              {isCheckedIn ? '✓ Checked in' : 'Registered'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            {reg.event.date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(reg.event.date)}
              </span>
            )}
            {reg.event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {reg.event.location}
              </span>
            )}
          </div>
        </div>
        <button className="ml-4 shrink-0 text-zinc-400 hover:text-violet-400 transition-colors p-1">
          {isCheckedIn
            ? <BadgeCheck className="w-5 h-5 text-green-400" />
            : <QrCode className="w-5 h-5" />}
        </button>
      </div>

      {/* Expandable QR section */}
      {expanded && (
        <div className="border-t border-zinc-800 p-6 text-center animate-fade-in">
          {isCheckedIn ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-[200px] h-[200px] rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto">
                <div className="text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Entry used</p>
                </div>
              </div>
              <p className="text-xs text-zinc-500">This QR has already been scanned and is no longer valid.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <QRCanvas value={scanUrl} greyed={false} />
              <p className="text-xs text-zinc-500">Show this QR at the entrance</p>
            </div>
          )}
          <p className="text-xs text-zinc-600 mt-3">Code: <code className="text-violet-400 font-mono">{reg.unique_code}</code></p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyEventsPage() {
  const router                    = useRouter();
  const { user, isAuthenticated, clearAuth, setAuth, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) router.replace('/login');
  }, [_hasHydrated, isAuthenticated, router]);

  // Refresh token on mount so header buttons (Dashboard / Pending Approval) reflect real status
  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated) return;
    const refreshToken = localStorage.getItem('entriq_refresh_token');
    if (!refreshToken) return;
    api.post('/auth/refresh', { refreshToken })
      .then(({ data }) => setAuth(data.token, data.refreshToken, data.user))
      .catch(() => {});
  }, [_hasHydrated, isAuthenticated, setAuth]);

  const { data: registrations, isLoading } = useQuery<UserRegistration[]>({
    queryKey: ['user-registrations'],
    queryFn: async () => {
      const { data } = await api.get('/user/registrations');
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  if (!_hasHydrated || !isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Gem className="w-5 h-5 text-violet-500" />
            <span className="font-semibold text-zinc-100">Entriq</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 hidden sm:block">{user.name}</span>
            {/* Participant without org can create one */}
            {!user.role && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/create-org">
                  <Building2 className="w-3.5 h-3.5 mr-1.5" />
                  Create Organisation
                </Link>
              </Button>
            )}
            {/* Pending org — link back to approval page */}
            {user.role && user.orgStatus === 'pending' && (
              <Button variant="outline" size="sm" className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10" asChild>
                <Link href="/pending-approval">⏳ Pending Approval</Link>
              </Button>
            )}
            {user.role && user.orgStatus === 'approved' && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            )}
            <button
              onClick={() => { clearAuth(); router.push('/login'); }}
              className="text-zinc-500 hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <Link href="/settings" className="text-zinc-500 hover:text-zinc-200 transition-colors" title="Settings">
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">My Events</h1>
          <p className="text-sm text-zinc-400 mt-1">Your event registrations and QR entry passes</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : !registrations?.length ? (
          <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <QrCode className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">No registrations yet</h2>
            <p className="text-sm text-zinc-500 mb-6">
              When you register for an event, your QR entry pass will appear here.
            </p>
            {!user.role && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/create-org">
                  <Building2 className="w-3.5 h-3.5 mr-1.5" />
                  Create an Organisation
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 mb-2">Tap a card to show your QR pass</p>
            {registrations.map((reg) => (
              <RegistrationCard key={reg.id} reg={reg} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
