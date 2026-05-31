// apps/web/app/(auth)/verify-phone/page.tsx
// For existing users who need to add/verify their phone to use the new auth system.
// Flow: enter phone + OTP -> set password -> logged in
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { AuthResponse } from '@entriq/shared';

type Step = 'phone' | 'otp' | 'password';

export default function VerifyPhonePage() {
  const router  = useRouter();
  const { setAuth } = useAuthStore();
  const [step, setStep]     = useState<Step>('phone');
  const [phone, setPhone]   = useState('');
  const [otp, setOtp]       = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSendOtp() {
    if (!/^\d{10}$/.test(phone)) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone, purpose: 'phone_verify' });
      setStep('otp');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send OTP.';
      // If phone not found: they need to sign up
      if ((err as { response?: { status?: number } })?.response?.status === 404) {
        setError('No account found with this number. Please sign up first.');
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  }

  function handleVerifyOtp() {
    if (otp.length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    setError('');
    setStep('password');
  }

  async function handleSetPassword() {
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setError("Passwords don't match."); return; }
    setError('');
    setLoading(true);
    try {
      const { data: res } = await api.post<AuthResponse>('/auth/verify-phone', { phone, otp, newPassword });
      setAuth(res.token, res.refreshToken, res.user);
      toast.success('Phone verified! You are now signed in.');
      router.push(res.user.orgStatus === 'approved' ? '/dashboard' : '/my-events');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Verification failed.';
      setError(msg);
    } finally { setLoading(false); }
  }

  async function handleResend() {
    try { await api.post('/auth/send-otp', { phone, purpose: 'phone_verify' }); toast.success('New OTP sent!'); }
    catch { toast.error('Failed to resend.'); }
  }

  const stepIdx = ['phone', 'otp', 'password'].indexOf(step);

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50">

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-100">Verify your phone</h1>
            <p className="text-xs text-zinc-500">Set up phone-based login</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {['Enter number', 'Verify OTP', 'Set password'].map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                stepIdx === i ? 'bg-violet-600 text-white' :
                stepIdx > i   ? 'bg-green-600 text-white' :
                'bg-zinc-800 text-zinc-500'
              }`}>{i + 1}</div>
              {i < 2 && <div className="flex-1 h-px bg-zinc-700" />}
            </div>
          ))}
        </div>

        {error && <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl"><p className="text-sm text-red-400">{error}</p></div>}

        {/* Step 1 - Phone */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Your mobile number</Label>
              <div className="flex mt-1.5">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-sm select-none">+91</span>
                <Input id="phone" type="tel" inputMode="numeric" maxLength={10} className="rounded-l-none" placeholder="98765 43210"
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()} autoFocus />
              </div>
            </div>
            <Button className="w-full h-11" onClick={handleSendOtp} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP...</> : 'Send OTP'}
            </Button>
          </div>
        )}

        {/* Step 2 - OTP */}
        {step === 'otp' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">OTP sent to +91 {phone}.</p>
            <div>
              <Label htmlFor="otp">6-digit OTP</Label>
              <Input id="otp" className="mt-1.5 text-center tracking-widest text-xl font-semibold" placeholder="000000"
                maxLength={6} inputMode="numeric" autoFocus value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && handleVerifyOtp()} />
            </div>
            <Button className="w-full h-11" onClick={handleVerifyOtp} disabled={otp.length !== 6}>
              Verify OTP
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Change number
              </button>
              <button type="button" onClick={handleResend} className="text-violet-400 hover:text-violet-300 transition-colors">
                Resend OTP
              </button>
            </div>
          </div>
        )}

        {/* Step 3 - Set password */}
        {step === 'password' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Set a password for phone-based login going forward.</p>
            <div>
              <Label htmlFor="new-pass">Password</Label>
              <PasswordInput id="new-pass" className="mt-1.5" placeholder="Min. 8 characters" autoFocus
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="confirm-pass">Confirm password</Label>
              <PasswordInput id="confirm-pass" className="mt-1.5"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSetPassword()} />
            </div>
            <Button className="w-full h-11" onClick={handleSetPassword} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Verify & sign in'}
            </Button>
          </div>
        )}

        <div className="mt-5 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
