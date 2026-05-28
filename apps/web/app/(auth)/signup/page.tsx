// apps/web/app/(auth)/signup/page.tsx
'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Users, Building2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AuthResponse } from '@entriq/shared';

type Mode = 'participant' | 'org';

const participantSchema = z.object({
  name:            z.string().min(2, 'Name must be at least 2 characters').max(100),
  email:           z.string().email('Enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });

const orgSchema = z.object({
  orgName:         z.string().min(2, 'Organisation name required').max(100),
  adminName:       z.string().min(2, 'Your name required').max(100),
  email:           z.string().email('Enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });

type ParticipantForm = z.infer<typeof participantSchema>;
type OrgForm = z.infer<typeof orgSchema>;

function SignupForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setAuth }  = useAuthStore();
  const [mode, setMode]           = useState<Mode>('participant');
  const [loading, setLoading]     = useState(false);
  const [checkEmail, setCheckEmail] = useState<{ email: string; orgPending?: boolean } | null>(null);

  const participantForm = useForm<ParticipantForm>({ resolver: zodResolver(participantSchema) });
  const orgForm         = useForm<OrgForm>({ resolver: zodResolver(orgSchema) });

  async function handleParticipant(data: ParticipantForm) {
    setLoading(true);
    try {
      const { data: res } = await api.post<AuthResponse & { emailVerificationRequired?: boolean; email?: string }>(
        '/auth/signup', { name: data.name, email: data.email, password: data.password },
      );
      if (res.emailVerificationRequired) {
        setCheckEmail({ email: res.email ?? data.email });
        return;
      }
      setAuth(res.token, res.refreshToken, res.user);
      toast.success('Account created! Welcome to Entriq.');
      const redirect = searchParams.get('redirect');
      router.push(redirect ?? '/my-events');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Signup failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleOrg(data: OrgForm) {
    setLoading(true);
    try {
      const { data: res } = await api.post<AuthResponse & { emailVerificationRequired?: boolean; email?: string; orgPending?: boolean }>(
        '/auth/signup/org',
        { orgName: data.orgName, adminName: data.adminName, email: data.email, password: data.password },
      );
      if (res.emailVerificationRequired) {
        setCheckEmail({ email: res.email ?? data.email, orgPending: res.orgPending });
        return;
      }
      setAuth(res.token, res.refreshToken, res.user);
      toast.success('Organisation registered! Awaiting admin approval.');
      router.push('/pending-approval');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Signup failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="w-full max-w-sm animate-slide-up">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl shadow-black/50">
          <MailCheck className="w-12 h-12 text-violet-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Check your email</h2>
          <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
            We sent a verification link to{' '}
            <span className="text-violet-400 font-medium">{checkEmail.email}</span>
          </p>
          {checkEmail.orgPending && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-4 text-left">
              <p className="text-xs text-yellow-300 leading-relaxed">
                After verifying your email, your organisation will be reviewed and approved by the platform admin before you can access the dashboard.
              </p>
            </div>
          )}
          <p className="text-xs text-zinc-500 mb-5">
            Didn&apos;t get it? Check spam, or{' '}
            <Link href="/signup" className="text-violet-400 hover:text-violet-300 transition-colors">
              try again
            </Link>
          </p>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md animate-slide-up">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Create account</h1>
          <p className="text-sm text-zinc-400 mt-1">Choose how you want to use Entriq</p>
        </div>

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
                mode === id
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-semibold">{label}</span>
              <span className={cn('text-xs', mode === id ? 'text-violet-200' : 'text-zinc-500')}>{desc}</span>
            </button>
          ))}
        </div>

        {mode === 'participant' && (
          <form onSubmit={participantForm.handleSubmit(handleParticipant)} className="space-y-4">
            <div>
              <Label htmlFor="p-name">Your name</Label>
              <Input id="p-name" className="mt-1.5" placeholder="Rahul Sharma"
                error={!!participantForm.formState.errors.name} {...participantForm.register('name')} />
              {participantForm.formState.errors.name && <p className="text-xs text-red-400 mt-1">{participantForm.formState.errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="p-email">Email address</Label>
              <Input id="p-email" type="email" className="mt-1.5" placeholder="you@example.com"
                error={!!participantForm.formState.errors.email} autoComplete="email" {...participantForm.register('email')} />
              {participantForm.formState.errors.email && <p className="text-xs text-red-400 mt-1">{participantForm.formState.errors.email.message}</p>}
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
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account&hellip;</> : 'Create account →'}
            </Button>
          </form>
        )}

        {mode === 'org' && (
          <form onSubmit={orgForm.handleSubmit(handleOrg)} className="space-y-4">
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
              <Label htmlFor="o-email">Email address</Label>
              <Input id="o-email" type="email" className="mt-1.5" placeholder="you@yourorg.com"
                error={!!orgForm.formState.errors.email} autoComplete="email" {...orgForm.register('email')} />
              {orgForm.formState.errors.email && <p className="text-xs text-red-400 mt-1">{orgForm.formState.errors.email.message}</p>}
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
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Registering&hellip;</> : 'Register organisation →'}
            </Button>
          </form>
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
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}