// apps/web/app/dashboard/events/[id]/scan/page.tsx
// Embedded QR scanner — admin opens this once, camera stays open all session.
// Gate password entered once, reused for every scan.
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertTriangle, Loader2, Camera, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import jsQR from 'jsqr';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ScannerState =
  | { type: 'setup' }           // enter gate password
  | { type: 'requesting' }      // waiting for camera permission dialog
  | { type: 'scanning' }        // camera open, waiting for QR
  | { type: 'loading' }         // QR found, fetching registration
  | { type: 'pending'; registration: RegistrationInfo; event: EventInfo; uniqueCode: string }
  | { type: 'approving' }
  | { type: 'approved'; name: string; approvedAt: string }
  | { type: 'already_approved'; name: string; approvedAt: string }
  | { type: 'wrong_password' }
  | { type: 'invalid'; message: string }
  | { type: 'error'; message: string };

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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const SCAN_COOLDOWN_MS = 2000; // ignore repeat scans of same code for 2s
const AUTO_RESET_MS   = 3000; // auto-return to camera after result

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const router = useRouter();

  const [state, setState] = useState<ScannerState>({ type: 'setup' });
  const [gatePassword, setGatePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [scanCount, setScanCount] = useState(0);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const lastCode   = useRef<string>('');
  const lastCodeAt = useRef<number>(0);
  const stateRef   = useRef<ScannerState['type']>('setup');

  // Keep stateRef in sync for use inside rAF loop
  useEffect(() => {
    stateRef.current = state.type;
  }, [state.type]);

  // ── Wake lock ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if ('wakeLock' in navigator) {
        try { lock = await navigator.wakeLock.request('screen'); } catch {}
      }
    };
    acquire();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') acquire();
    });
    return () => { lock?.release(); };
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();

    // Guard: mediaDevices not available (HTTP context, old browser, etc.)
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        type: 'error',
        message: 'Camera API not available. Make sure you are on HTTPS and using a supported browser (Safari 11+, Chrome, Firefox).',
      });
      return;
    }

    // Show spinner BEFORE calling getUserMedia — iOS shows a permission dialog and
    // the user gesture chain is consumed on the first call. Don't loop with await.
    setState({ type: 'requesting' });

    // Overall 12-second timeout — prevents getting stuck on "requesting" forever
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setState({ type: 'error', message: 'Camera timed out. Please tap "Try again" or check your browser permissions.' });
    }, 12_000);

    let stream: MediaStream | null = null;
    try {
      // First attempt: rear camera, no resolution constraints (most compatible with iOS Safari)
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (firstErr) {
      clearTimeout(timeoutId);
      if (timedOut) return;
      const name = (firstErr as { name?: string }).name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setState({ type: 'error', message: 'Camera permission denied. Go to Settings → Safari → Camera and set to Allow.' });
        return;
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setState({ type: 'error', message: 'No camera found on this device.' });
        return;
      }
      // OverconstrainedError or other — fall back to any camera (front-facing tablet etc.)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (fallbackErr) {
        const fn = (fallbackErr as { name?: string }).name ?? 'Unknown';
        setState({ type: 'error', message: `Could not start camera (${fn}). Please try again.` });
        return;
      }
    }

    clearTimeout(timeoutId);
    if (timedOut) return;

    if (!stream) {
      setState({ type: 'error', message: 'Could not acquire camera stream.' });
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;

      // Wait for loadedmetadata with a 5s timeout — iOS can be slow
      await new Promise<void>((resolve) => {
        const v = videoRef.current!;
        if (v.readyState >= 1) { resolve(); return; }
        const tid = setTimeout(resolve, 5000); // timeout fallback
        v.addEventListener('loadedmetadata', () => { clearTimeout(tid); resolve(); }, { once: true });
      });

      try {
        await videoRef.current.play();
      } catch {
        // play() rejection is non-fatal — iOS often still renders the stream
      }
    }

    if (!timedOut) setState({ type: 'scanning' });
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── QR scan loop ───────────────────────────────────────────────────────────

  const scanFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Only scan in 'scanning' state
    if (stateRef.current !== 'scanning') {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return; }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code?.data) {
      const now = Date.now();
      // Cooldown: skip if same code scanned within 2s
      if (code.data === lastCode.current && now - lastCodeAt.current < SCAN_COOLDOWN_MS) {
        rafRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      lastCode.current   = code.data;
      lastCodeAt.current = now;

      // Extract unique_code from URL or use raw value
      let uniqueCode = code.data;
      try {
        const url = new URL(code.data);
        if (url.origin === APP_URL || url.hostname.includes('localhost')) {
          const parts = url.pathname.split('/');
          uniqueCode = parts[parts.length - 1];
        }
      } catch {
        // Not a URL — use as-is
      }

      handleCodeDetected(uniqueCode);
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start scan loop when camera starts
  useEffect(() => {
    if (state.type === 'scanning') {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [state.type, scanFrame]);

  // ── Code detected → fetch registration ────────────────────────────────────

  async function handleCodeDetected(uniqueCode: string) {
    setState({ type: 'loading' });
    try {
      const { data } = await api.get(`/checkin/${uniqueCode}`);
      if (data.registration.status === 'approved') {
        setState({
          type: 'already_approved',
          name: `${data.registration.name} ${data.registration.surname}`,
          approvedAt: data.approvedAt ?? new Date().toISOString(),
        });
        scheduleReset();
      } else {
        setState({
          type: 'pending',
          registration: data.registration,
          event: data.event,
          uniqueCode,
        });
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setState({ type: 'invalid', message: 'QR code not found in this system.' });
      } else {
        setState({ type: 'error', message: 'Network error. Check your connection.' });
      }
      scheduleReset();
    }
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  async function handleApprove(uniqueCode: string) {
    setState({ type: 'approving' });
    try {
      const { data } = await api.post(`/checkin/${uniqueCode}`, {
        adminPassword: gatePassword,
      });

      if (data.ok) {
        setScanCount((c) => c + 1);
        setState({ type: 'approved', name: data.name, approvedAt: data.approvedAt });
        scheduleReset();
      } else if (data.alreadyApproved) {
        setState({ type: 'already_approved', name: data.name, approvedAt: data.approvedAt });
        scheduleReset();
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) {
        setState({ type: 'wrong_password' });
      } else {
        setState({ type: 'error', message: 'Failed to approve. Try again.' });
        scheduleReset();
      }
    }
  }

  // ── Auto-reset to scanning ─────────────────────────────────────────────────

  function scheduleReset() {
    setTimeout(() => {
      lastCode.current = ''; // allow same code to be scanned again after reset
      setState({ type: 'scanning' });
    }, AUTO_RESET_MS);
  }

  function manualReset() {
    lastCode.current = '';
    setState({ type: 'scanning' });
  }

  // ── Setup — open camera (not a form submit, avoids iOS Safari autofill interception)

  function handleOpenCamera() {
    if (!gatePassword.trim()) {
      setPasswordError('Enter the gate password for this event');
      return;
    }
    setPasswordError('');
    startCamera();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 overflow-hidden select-none">

      {/* Always-present video + hidden canvas for scanning */}
      <video
        ref={videoRef}
        className={cn(
          'fixed inset-0 w-full h-full object-cover pointer-events-none',
          state.type === 'scanning' ? 'opacity-100' : 'opacity-0',
        )}
        playsInline
        autoPlay
        muted
        aria-hidden="true"
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <AnimatePresence mode="wait">

        {/* ── SETUP: enter gate password ───────────────────────────────── */}
        {state.type === 'setup' && (
          <motion.div key="setup"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center p-6"
          >
            <button
              onClick={() => router.push(`/dashboard/events/${eventId}`)}
              className="absolute top-4 left-4 flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="w-full max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6 mx-auto">
                <Camera className="w-8 h-8 text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold text-zinc-100 text-center mb-1">Gate Scanner</h1>
              <p className="text-zinc-500 text-sm text-center mb-8">
                Enter the gate password once to start scanning
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-2">
                    Gate password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={gatePassword}
                      onChange={(e) => { setGatePassword(e.target.value); setPasswordError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleOpenCamera()}
                      placeholder="Enter event gate password"
                      autoComplete="off"
                      inputMode="text"
                      className={cn(
                        'w-full h-14 bg-zinc-900 border rounded-xl px-4 pr-12 text-lg text-zinc-100',
                        'placeholder:text-zinc-600 outline-none transition-all',
                        passwordError
                          ? 'border-red-500'
                          : 'border-zinc-700 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-sm text-red-400 mt-1.5">{passwordError}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleOpenCamera}
                  className="w-full h-14 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.98]
                    text-white text-base font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <Camera className="w-5 h-5" />
                  Open Camera &amp; Start Scanning
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── REQUESTING: waiting for camera permission dialog ────────── */}
        {state.type === 'requesting' && (
          <motion.div key="requesting"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-5 p-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Camera className="w-8 h-8 text-violet-400 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-zinc-100 font-semibold text-lg">Requesting camera access</p>
              <p className="text-zinc-500 text-sm mt-1">Please allow camera access when prompted by your browser.</p>
            </div>
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </motion.div>
        )}

        {/* ── SCANNING: camera + overlay ───────────────────────────────── */}
        {state.type === 'scanning' && (
          <motion.div key="scanning"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0"
          >
            {/* Scan frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64">
                {/* Corner brackets */}
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-violet-400 rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-violet-400 rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-violet-400 rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-violet-400 rounded-br-lg" />
                {/* Scan line animation */}
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-violet-400/70"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </div>

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
              <button
                onClick={() => { stopCamera(); setState({ type: 'setup' }); }}
                className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-white/80 text-sm font-medium">Point at QR code</span>
              {scanCount > 0 && (
                <span className="text-green-400 text-sm font-medium">{scanCount} ✓</span>
              )}
            </div>

            {/* Bottom hint */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-6 bg-gradient-to-t from-black/70 to-transparent">
              <p className="text-white/50 text-xs">QR code detected automatically</p>
            </div>
          </motion.div>
        )}

        {/* ── LOADING ──────────────────────────────────────────────────── */}
        {(state.type === 'loading' || state.type === 'approving') && (
          <motion.div key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-950/95 flex flex-col items-center justify-center gap-4"
          >
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
            <p className="text-zinc-400 text-sm">
              {state.type === 'approving' ? 'Approving entry…' : 'Looking up registration…'}
            </p>
          </motion.div>
        )}

        {/* ── PENDING: show person + approve button ────────────────────── */}
        {state.type === 'pending' && (
          <motion.div key="pending"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 bg-zinc-950 flex flex-col justify-between p-6 overflow-y-auto"
          >
            <div>
              <button onClick={manualReset} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm mb-6">
                <ArrowLeft className="w-4 h-4" /> Back to scanner
              </button>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium mb-4">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                PENDING ENTRY
              </div>

              <h1 className="text-4xl font-bold text-zinc-100 leading-tight mb-3">
                {state.registration.name} {state.registration.surname}
              </h1>

              <div className="space-y-1.5 text-zinc-400 text-base">
                <p>📍 {state.registration.city}, {state.registration.state}</p>
                <p>📞 {state.registration.mobile}</p>
                <p>💼 {state.registration.profession}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Event</p>
                <p className="text-zinc-300 font-medium">{state.event.name}</p>
              </div>

              <div className="mt-4">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Entry ID</p>
                <code className="text-sm text-zinc-400 font-mono">{state.registration.unique_code}</code>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <button
                onClick={() => handleApprove(state.uniqueCode)}
                className="w-full h-16 rounded-2xl bg-green-600 hover:bg-green-500 active:scale-[0.98]
                  text-white text-xl font-semibold flex items-center justify-center gap-3
                  transition-all shadow-lg shadow-green-900/30"
              >
                <Check className="w-6 h-6" strokeWidth={3} />
                APPROVE ENTRY
              </button>
              <button
                onClick={manualReset}
                className="w-full h-12 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-600"
              >
                Cancel — scan different code
              </button>
            </div>
          </motion.div>
        )}

        {/* ── WRONG PASSWORD ───────────────────────────────────────────── */}
        {state.type === 'wrong_password' && (
          <motion.div key="wrong-pw"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-red-950 flex flex-col items-center justify-center gap-5 p-6 text-center"
          >
            <X className="w-16 h-16 text-red-400" strokeWidth={3} />
            <div>
              <h2 className="text-2xl font-bold text-red-200 mb-2">Wrong Password</h2>
              <p className="text-red-400 text-sm">The gate password is incorrect.</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <button
                onClick={() => { stopCamera(); setState({ type: 'setup' }); setGatePassword(''); }}
                className="w-full py-3 rounded-xl bg-red-800/50 border border-red-700/50 text-red-200 text-sm font-medium"
              >
                Change gate password
              </button>
              <button
                onClick={manualReset}
                className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm"
              >
                Go back to scanner
              </button>
            </div>
          </motion.div>
        )}

        {/* ── APPROVED ─────────────────────────────────────────────────── */}
        {state.type === 'approved' && (
          <motion.div key="approved"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-green-950 flex flex-col items-center justify-center gap-5 text-center p-6"
          >
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200 }}
              className="w-28 h-28 rounded-full bg-green-500/20 border-4 border-green-500/50 flex items-center justify-center"
            >
              <Check className="w-14 h-14 text-green-400" strokeWidth={3} />
            </motion.div>
            <div>
              <h1 className="text-3xl font-bold text-green-300 tracking-wide mb-2">ENTRY APPROVED</h1>
              <p className="text-2xl font-semibold text-green-200 mb-1">{state.name}</p>
              <p className="text-green-500 text-sm">Approved at {formatTime(state.approvedAt)}</p>
            </div>
            <p className="text-green-600 text-xs mt-4">Returning to scanner…</p>
          </motion.div>
        )}

        {/* ── ALREADY APPROVED ─────────────────────────────────────────── */}
        {state.type === 'already_approved' && (
          <motion.div key="already"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-yellow-950 flex flex-col items-center justify-center gap-5 text-center p-6"
          >
            <AlertTriangle className="w-20 h-20 text-yellow-400" />
            <div>
              <h1 className="text-3xl font-bold text-yellow-200 tracking-wide mb-2">ALREADY CHECKED IN</h1>
              <p className="text-2xl font-semibold text-yellow-300 mb-1">{state.name}</p>
              <p className="text-yellow-500 text-sm">Previously at {formatTime(state.approvedAt)}</p>
            </div>
            <button onClick={manualReset} className="mt-4 px-6 py-2.5 rounded-xl bg-yellow-800/50 border border-yellow-700/50 text-yellow-200 text-sm">
              Scan next person
            </button>
          </motion.div>
        )}

        {/* ── INVALID ──────────────────────────────────────────────────── */}
        {state.type === 'invalid' && (
          <motion.div key="invalid"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-red-950/80 flex flex-col items-center justify-center gap-4 text-center p-6"
          >
            <X className="w-16 h-16 text-red-400" strokeWidth={3} />
            <div>
              <h2 className="text-2xl font-bold text-red-200 mb-1">Invalid QR Code</h2>
              <p className="text-red-400 text-sm">{state.message}</p>
            </div>
            <p className="text-red-600 text-xs">Returning to scanner…</p>
          </motion.div>
        )}

        {/* ── ERROR ────────────────────────────────────────────────────── */}
        {state.type === 'error' && (
          <motion.div key="error"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-4 text-center p-6"
          >
            <AlertTriangle className="w-12 h-12 text-zinc-500" />
            <p className="text-zinc-300 font-medium">{state.message}</p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => startCamera()}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm"
              >
                Try again
              </button>
              <button
                onClick={() => { stopCamera(); setState({ type: 'setup' }); }}
                className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm"
              >
                Setup
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
