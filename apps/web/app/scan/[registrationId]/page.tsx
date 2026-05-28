// apps/web/app/scan/[registrationId]/page.tsx
// Admin scan page — full-screen, 6 states, wake lock, back-nav prevention.
// Designed for one-thumb use on any phone in bright daylight.
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ScanState =
  | { type: 'loading' }
  | { type: 'pending'; registration: RegistrationInfo; event: EventInfo }
  | { type: 'approved'; name: string; approvedAt: string }
  | { type: 'already_approved'; name: string; approvedAt: string }
  | { type: 'wrong_password'; registration: RegistrationInfo; event: EventInfo }
  | { type: 'invalid' };

interface RegistrationInfo {
  id: string;
  name: string;
  surname: string;
  city: string;
  state: string;
  mobile: string;
  profession: string;
  unique_code: string;
  status: string;
}

interface EventInfo {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScanPage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const [state, setState] = useState<ScanState>({ type: 'loading' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [approving, setApproving] = useState(false);
  const [shake, setShake] = useState(false);
  const [wrongPasswordMsg, setWrongPasswordMsg] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  // ── Load registration on mount ────────────────────────────────────────────

  const loadRegistration = useCallback(async () => {
    setState({ type: 'loading' });
    try {
      const { data } = await api.get(`/checkin/${registrationId}`);
      if (data.registration.status === 'approved') {
        setState({
          type: 'already_approved',
          name: `${data.registration.name} ${data.registration.surname}`,
          approvedAt: data.approvedAt ?? new Date().toISOString(),
        });
      } else {
        setState({
          type: 'pending',
          registration: data.registration,
          event: data.event,
        });
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setState({ type: 'invalid' });
      } else {
        setState({ type: 'invalid' });
      }
    }
  }, [registrationId]);

  useEffect(() => {
    loadRegistration();
  }, [loadRegistration]);

  // ── Wake lock — keep screen on ────────────────────────────────────────────

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((l) => { lock = l; })
        .catch(() => {}); // Not supported or denied — ignore
    }
    return () => { lock?.release(); };
  }, []);

  // ── Prevent back navigation after approval ─────────────────────────────────

  useEffect(() => {
    if (state.type === 'approved') {
      window.history.pushState(null, '', window.location.href);
      const handler = () => {
        window.history.pushState(null, '', window.location.href);
      };
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    }
  }, [state.type]);

  // ── Auto-focus password on pending ────────────────────────────────────────

  useEffect(() => {
    if (state.type === 'pending' || state.type === 'wrong_password') {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  }, [state.type]);

  // ── Approve handler ────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!password.trim()) {
      triggerShake('Enter the gate password');
      return;
    }

    const registration =
      state.type === 'pending' ? state.registration
      : state.type === 'wrong_password' ? state.registration
      : null;

    if (!registration) return;

    setApproving(true);
    setWrongPasswordMsg('');

    try {
      const { data } = await api.post(`/checkin/${registration.unique_code}`, {
        adminPassword: password,
      });

      if (data.ok) {
        setState({ type: 'approved', name: data.name, approvedAt: data.approvedAt });
      } else if (data.alreadyApproved) {
        setState({
          type: 'already_approved',
          name: data.name,
          approvedAt: data.approvedAt,
        });
      } else if (data.error === 'Wrong password') {
        triggerShake('Wrong password. Try again.');
        setPassword('');
        setState({
          type: 'wrong_password',
          registration,
          event: state.type === 'pending' ? state.event : (state as { event: EventInfo }).event,
        });
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const errData = (err as { response?: { data?: { error?: string } } })?.response?.data;

      if (status === 422 && errData?.error === 'Wrong password') {
        // Wrong password — stay on form, shake
        triggerShake('Wrong password. Try again.');
        setPassword('');
        setState({
          type: 'wrong_password',
          registration,
          event: state.type === 'pending' ? state.event : (state as { event: EventInfo }).event,
        });
      } else {
        triggerShake('Something went wrong. Try again.');
      }
    } finally {
      setApproving(false);
    }
  }

  function triggerShake(msg: string) {
    setShake(true);
    setWrongPasswordMsg(msg);
    setTimeout(() => {
      setShake(false);
      passwordRef.current?.focus();
    }, 400);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen overflow-hidden select-none" style={{ fontSize: '18px' }}>
      <AnimatePresence mode="wait">

        {/* STATE: Loading */}
        {state.type === 'loading' && (
          <motion.div key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4"
          >
            <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
            <p className="text-zinc-400 text-base">Looking up registration…</p>
          </motion.div>
        )}

        {/* STATE: Invalid QR */}
        {state.type === 'invalid' && (
          <FullScreenState key="invalid" bg="bg-red-950"
            icon={<X className="w-16 h-16 text-red-400" strokeWidth={3} />}
            title="INVALID QR CODE"
            titleColor="text-red-200"
            subtitle="This QR code is not recognised."
            subtitleColor="text-red-400"
            action={{ label: 'Return to dashboard', href: '/dashboard', color: 'bg-red-800/50 text-red-200 border border-red-700/50' }}
          />
        )}

        {/* STATE: Already approved */}
        {state.type === 'already_approved' && (
          <FullScreenState key="already"
            bg="bg-yellow-950"
            icon={<AlertTriangle className="w-16 h-16 text-yellow-400" />}
            title="ALREADY CHECKED IN"
            titleColor="text-yellow-200"
            subtitle={state.name}
            subtitleColor="text-yellow-300"
            sub2={`Previously approved at ${formatTime(state.approvedAt)}`}
            sub2Color="text-yellow-500"
            action={{ label: 'Scan next person', href: '/dashboard', color: 'bg-yellow-800/50 text-yellow-200 border border-yellow-700/50' }}
          />
        )}

        {/* STATE: Approved */}
        {state.type === 'approved' && (
          <FullScreenState key="approved"
            bg="bg-green-950"
            icon={
              <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
                <Check className="w-12 h-12 text-green-400" strokeWidth={3} />
              </div>
            }
            title="ENTRY VERIFIED"
            titleColor="text-green-300"
            subtitle={state.name}
            subtitleColor="text-green-200"
            sub2={`Approved at ${formatTime(state.approvedAt)}`}
            sub2Color="text-green-500"
            action={{ label: 'Scan next person', href: '/dashboard', color: 'bg-green-800/50 text-green-200 border border-green-700/50' }}
          />
        )}

        {/* STATE: Pending / Wrong password */}
        {(state.type === 'pending' || state.type === 'wrong_password') && (
          <motion.div key="pending"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="min-h-screen bg-zinc-950 flex flex-col justify-between p-6"
          >
            {/* Top: badge + person info */}
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                PENDING ENTRY
              </div>

              {/* Name */}
              <h1 className="text-4xl font-bold text-zinc-100 leading-tight mb-1">
                {state.registration.name} {state.registration.surname}
              </h1>

              {/* Details */}
              <div className="space-y-1 mt-3 text-zinc-400">
                <p>{state.registration.city}, {state.registration.state}</p>
                <p>📞 {state.registration.mobile}</p>
                <p>💼 {state.registration.profession}</p>
              </div>
            </div>

            {/* Middle: Entry ID */}
            <div className="my-6">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Entry ID</p>
              <code className="text-sm text-zinc-400 font-mono">{state.registration.unique_code}</code>
              <div className="border-t border-zinc-800 mt-4" />
            </div>

            {/* Bottom: password + approve */}
            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Gate password</p>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setWrongPasswordMsg('');
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApprove(); }}
                    placeholder="Enter password"
                    className={cn(
                      'w-full h-14 bg-zinc-900 border rounded-xl px-4 pr-14 text-lg text-zinc-100',
                      'placeholder:text-zinc-600 outline-none transition-all',
                      shake
                        ? 'border-red-500 animate-shake'
                        : 'border-zinc-700 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'
                    )}
                    autoComplete="current-password"
                    inputMode="text"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {wrongPasswordMsg && (
                  <p className="text-sm text-red-400 mt-1.5 animate-fade-in">{wrongPasswordMsg}</p>
                )}
              </div>

              {/* Approve button */}
              <button
                onClick={handleApprove}
                disabled={approving}
                aria-label={`Approve entry for ${state.registration.name} ${state.registration.surname}`}
                className={cn(
                  'w-full h-16 rounded-2xl bg-green-600 hover:bg-green-500 active:scale-[0.98]',
                  'text-white text-xl font-semibold flex items-center justify-center gap-3',
                  'transition-all duration-150 shadow-lg shadow-green-900/30',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {approving ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Check className="w-6 h-6" strokeWidth={3} />
                    APPROVE ENTRY
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ─── Full-screen state component ──────────────────────────────────────────────

interface FullScreenStateProps {
  bg: string;
  icon: React.ReactNode;
  title: string;
  titleColor: string;
  subtitle?: string;
  subtitleColor?: string;
  sub2?: string;
  sub2Color?: string;
  action?: { label: string; href: string; color: string };
}

function FullScreenState({
  bg, icon, title, titleColor, subtitle, subtitleColor, sub2, sub2Color, action,
}: FullScreenStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'min-h-screen flex flex-col items-center justify-center text-center p-8',
        bg
      )}
    >
      <div className="mb-6">{icon}</div>
      <h1 className={cn('text-3xl font-bold tracking-wide mb-3', titleColor)}>{title}</h1>
      {subtitle && <p className={cn('text-2xl font-semibold mb-1', subtitleColor)}>{subtitle}</p>}
      {sub2 && <p className={cn('text-base mt-1', sub2Color)}>{sub2}</p>}
      {action && (
        <Link
          href={action.href}
          className={cn(
            'mt-10 px-6 py-3 rounded-xl font-medium text-sm transition-colors',
            action.color
          )}
        >
          {action.label}
        </Link>
      )}
    </motion.div>
  );
}
