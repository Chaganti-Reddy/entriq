// apps/web/app/(auth)/signup/page.tsx
'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Users, Building2, MessageSquare, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AuthResponse } from '@entriq/shared';

type Mode = 'participant' | 'org';
type Step = 'form' | 'otp';

const phoneSchema = z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number');

const participantSchema = z.object({
  name:            z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone:           phoneSchema,
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });

const orgSchema = z.object({
  orgName:         z.string().min(2, 'Organisation name required').max(100),
  adminName:       z.string().min(2, 'Your name required').max(100),
  phone:           phoneSchema,
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });

type ParticipantForm = z.infer<typeof participantSchema>;
type OrgForm = z.infer<typeof orgSchema>;

/** Reusable phone input with +91 prefix */
function PhoneInput({ id, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <div className="flex">
      <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-sm select-none">
        +91
      </span>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        maxLength={10}
        className="rounded-l-none"
        placeholder="98765 43210"
        error={error}
        autoComplete="tel-national"
        {...props}
      />
    </div>
  );
}

/** OTP entry step — shared for participant and org */
function OtpStep({
  phone,
  loading,
  onVerify,
  onBack,
  onResend,
}: {
  phone: string;
  loading: boolean;
  onVerify: (otp: string) => void;
  onBack: () => void;
  onResend: () => void;
}) {
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);

  async function handleResend() {
    setResending(true);
    try { await onResend(); toast.success('New OTP sent!'); } catch { toast.error('Failed to resend OTP.'); }
    finally { setResending(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-violet-500/5 border border-violet-500/20 rounded-xl p-4">
        <MessageSquare className="w-5 h-5 text-violet-400 shrink-0" />
        <div>
          <p className="text-sm text-zinc-200 font-medium">OTP sent to +91 {phone}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Valid for 10 minutes</p>
        </div>
      </div>

      <div>
        <Label htmlFor="otp">Enter 6-digit OTP</Label>
        <Input
          id="otp"
          className="mt-1.5 text-center tracking-widest text-xl font-semibold"
          placeholder="• • • • • •"
          maxLength={6}
          inputMode="numeric"
          autoFocus
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && onVerify(otp)}
        />
      </div>

      <Button className="w-full h-11" disabled={loading || otp.length !== 6} onClick={() => onVerify(otp)}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify OTP →'}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Change number
        </button>
        <button type="button" onClick={handleResend} disabled={resending} className="text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50">
          {resending ? 'Sending…' : 'Resend OTP'}
        </button>
      </div>
    </div>
  );
}

function SignupForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setAuth }  = useAuthStore();
  const [mode, setMode]   = useState<Mode>('participant');
  const [step, setStep]   = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [pendingData, setPendingData] = useState<any>(null);

  const participantForm = useForm<ParticipantForm>({ resolver: zodResolver(participantSchema) });
  const orgForm         = useForm<OrgForm>({ resolver: zodResolver(orgSchema) });

  async function sendOtp(phone: string) {
    await api.post('/auth/send-otp', { phone, purpose: 'signup' });
  }

  async function handleParticipantNext(data: ParticipantForm) {
    setLoading(true);
    try {
      await sendOtp(data.phone);
      setPendingData(data);
      setOtpPhone(data.phone);
      setStep('otp');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send OTP.';
      toast.error(msg);
    } finally { setLoading(false); }
  }

  async function handleOrgNext(data: OrgForm) {
    setLoading(true);
    try {
      await sendOtp(data.phone);
      setPendingData(data);
      setOtpPhone(data.phone);
      setStep('otp');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send OTP.';
      toast.error(msg);
    } finally { setLoading(false); }
  }

  async function handleOtpVerify(otp: string) {
    if (!pendingData) return;
    setLoading(true);
    try {
      if (mode === 'participant') {
        const { data: res } = await api.post<AuthResponse>('/auth/signup', {
          name: pendingData.name, phone: pendingData.phone, password: pendingData.password, otp,
        });
        setAuth(res.token, res.refreshToken, res.user);
        toast.success('Account created! Welcome to Entriq.');
        router.push(searchParams.get('redirect') ?? '/my-events');
      } else {
        const { data: res } = await api.post<AuthResponse>('/auth/signup/org', {
          orgName: pendingData.orgName, adminName: pendingData.adminName,
          phone: pendingData.phone, password: pendingData.password, otp,
        });
        setAuth(res.token, res.refreshToken, res.user);
        toast.success('Organisation registered! Awaiting admin approval.');
        router.push('/pending-approval');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Verification failed.';
      toast.error(msg);
    } finally { setLoading(false); }
  }

  function handleBack() {
    setStep('form');
    setPendingData(null);
  }

  async function handleResend() {
    await sendOtp(otpPhone);
  }

  return (
    <div className="w-full max-w-md animate-slide-up">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Create account</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {step === 'otp' ? 'Enter the OTP sent to your number' : 'Choose how you want to use Entriq'}
          </p>
        </div>

        {step === 'form' && (
          <>
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-xl mb-6">
              {([
                { id: 'participant' as Mode, icon: Users,     label: 'Attend Events',       desc: 'Register & track events' },
                { id: 'org'         as Mode, icon: Building2, label: 'Run an Organisation', desc: 'Create & manage events' },
              ] as const).map(({ id, icon: Icon, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg text-center transition-all',
                    mode === id ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className={cn('text-xs', mode === id ? 'text-violet-200' : 'text-zinc-500')}>{desc}</span>
                </button>
              ))}
            </div>

            {mode === 'participant' && (
              <form onSubmit={participantForm.handleSubmit(handleParticipantNext)} className="space-y-4">
                <div>
                  <Label htmlFor="p-name">Your name</Label>
                  <Input id="p-name" className="mt-1.5" placeholder="Rahul Sharma"
                    error={!!participantForm.formState.errors.name} {...participantForm.register('name')} />
                  {participantForm.formState.errors.name && <p className="text-xs text-red-400 mt-1">{participantForm.formState.errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="p-phone">Mobile number</Label>
                  <div className="mt-1.5">
                    <PhoneInput id="p-phone" error={!!participantForm.formState.errors.phone} {...participantForm.register('phone')} />
                  </div>
                  {participantForm.formState.errors.phone && <p className="text-xs text-red-400 mt-1">{participantForm.formState.errors.phone.message}</p>}
                </div>
                <div>
                  <Label htmlFor="p-pass">Password</Label>
                  <PasswordInput id="p-pass" className="mt-1.5" placeholder="Min. 8 characters"
                    error={!!participantForm.formState.errors.password} {...participantForm.register('password')} />
                  {participantForm.formState.errors.password && <p className="text-xs text-red-400 mt-1">{participantForm.formState.errors.password.message}</p>}
                </div>
                <div>
                  <Label htmlFor="p-confirm">Confirm password</Label>
                  <PasswordInput id="p-confirm" className="mt-1.5"
                    error={!!participantForm.formState.errors.confirmPassword} {...participantForm.register('confirmPassword')} />
                  {participantForm.formState.errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{participantForm.formState.errors.confirmPassword.message}</p>}
                </div>
                <Button type="submit" className="w-full h-11 mt-2" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP…</> : 'Send OTP →'}
                </Button>
              </form>
            )}

            {mode === 'org' && (
              <form onSubmit={orgForm.handleSubmit(handleOrgNext)} className="space-y-4">
                <div>
                  <Label htmlFor="o-orgname">Organisation name</Label>
                  <Input id="o-orgname" className="mt-1.5" placeholder="Tech Fest Hyderabad"
                    error={!!orgForm.formState.errors.orgName} {...orgForm.register('orgName')} />
                  {orgForm.formState.errors.orgName && <p className="text-xs text-red-400 mt-1">{orgForm.formState.errors.orgName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="o-adminname">Your name (admin)</Label>
                  <Input id="o-adminname" className="mt-1.5" placeholder="Rahul Sharma"
                    error={!!orgForm.formState.errors.adminName} {...orgForm.register('adminName')} />
                  {orgForm.formState.errors.adminName && <p className="text-xs text-red-400 mt-1">{orgForm.formState.errors.adminName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="o-phone">Mobile number</Label>
                  <div className="mt-1.5">
                    <PhoneInput id="o-phone" error={!!orgForm.formState.errors.phone} {...orgForm.register('phone')} />
                  </div>
                  {orgForm.formState.errors.phone && <p className="text-xs text-red-400 mt-1">{orgForm.formState.errors.phone.message}</p>}
                </div>
                <div>
                  <Label htmlFor="o-pass">Password</Label>
                  <PasswordInput id="o-pass" className="mt-1.5" placeholder="Min. 8 characters"
                    error={!!orgForm.formState.errors.password} {...orgForm.register('password')} />
                  {orgForm.formState.errors.password && <p className="text-xs text-red-400 mt-1">{orgForm.formState.errors.password.message}</p>}
                </div>
                <div>
                  <Label htmlFor="o-confirm">Confirm password</Label>
                  <PasswordInput id="o-confirm" className="mt-1.5"
                    error={!!orgForm.formState.errors.confirmPassword} {...orgForm.register('confirmPassword')} />
                  {orgForm.formState.errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{orgForm.formState.errors.confirmPassword.message}</p>}
                </div>
                <p className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  ⚠️ Your organisation will need to be approved by the platform admin before you can access the dashboard.
                </p>
                <Button type="submit" className="w-full h-11 mt-2" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP…</> : 'Send OTP →'}
                </Button>
              </form>
            )}
          </>
        )}

        {step === 'otp' && (
          <OtpStep
            phone={otpPhone}
            loading={loading}
            onVerify={handleOtpVerify}
            onBack={handleBack}
            onResend={handleResend}
          />
        )}

        <p className="text-sm text-zinc-500 text-center mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
