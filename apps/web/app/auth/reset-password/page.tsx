// apps/web/app/auth/reset-password/page.tsx
// Supabase redirects here after user clicks the reset link in email.
// Extracts the token from the URL hash, lets user set a new password.
'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';

const schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
type FormData = z.infer<typeof schema>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Supabase puts the recovery token in the URL hash as #access_token=...&type=recovery
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      // Let Supabase JS pick up the session from the hash
      supabase.auth.getSession().then(({ data }: { data: { session: { user: unknown } | null } }) => {
        if (data.session) {
          setSessionReady(true);
        } else {
          setSessionError('Reset link is invalid or has expired. Please request a new one.');
        }
      });
    } else {
      // Check for error in query params (Supabase sometimes uses these)
      const error = searchParams.get('error_description') ?? searchParams.get('error');
      if (error) {
        setSessionError(error);
      } else {
        setSessionError('No reset token found. Please request a new password reset link.');
      }
    }
  }, [searchParams]);

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) {
        toast.error(error.message);
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm animate-slide-up">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-100 mb-2">Password updated!</h1>
          <p className="text-sm text-zinc-400">Redirecting you to sign in…</p>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="w-full max-w-sm animate-slide-up">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50 text-center">
          <h1 className="text-xl font-bold text-zinc-100 mb-3">Invalid reset link</h1>
          <p className="text-sm text-zinc-400 mb-6">{sessionError}</p>
          <Button asChild className="w-full">
            <a href="/forgot-password">Request new reset link</a>
          </Button>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="w-full max-w-sm flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/20">
          <KeyRound className="w-5 h-5 text-violet-400" />
        </div>
        <h1 className="text-xl font-bold text-zinc-100 mb-1 text-center">Set new password</h1>
        <p className="text-sm text-zinc-400 mb-6 text-center">Choose a strong password.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="password">New password</Label>
            <PasswordInput id="password" className="mt-1.5" placeholder="Min. 8 characters"
              error={!!errors.password} autoFocus {...register('password')} />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <PasswordInput id="confirm" className="mt-1.5"
              error={!!errors.confirmPassword} {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" className="w-full h-11 mt-2" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : 'Update password →'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
