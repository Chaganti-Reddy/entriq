// apps/web/app/(auth)/login/page.tsx
'use client';

import { Suspense } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { AuthResponse } from '@entriq/shared';

const schema = z.object({
  phone:    z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setAuth }  = useAuthStore();
  const [loading, setLoading]         = useState(false);
  const [globalError, setGlobalError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setGlobalError('');
    try {
      const { data: res } = await api.post<AuthResponse>('/auth/login', {
        phone: data.phone, password: data.password,
      });
      setAuth(res.token, res.refreshToken, res.user);
      toast.success(`Welcome back, ${res.user.name}!`);

      const redirect = searchParams.get('redirect');
      if (res.user.role && res.user.orgStatus) {
        router.push(res.user.orgStatus === 'approved' ? (redirect ?? '/dashboard') : '/pending-approval');
      } else {
        router.push(redirect ?? '/my-events');
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const data   = (err as { response?: { data?: { error?: string; requiresPhoneVerification?: boolean } } })?.response?.data;
      if (status === 401) {
        setGlobalError('Invalid phone number or password. Please try again.');
      } else if (status === 403 && data?.requiresPhoneVerification) {
        router.push('/verify-phone');
      } else if (status === 403) {
        setGlobalError(data?.error ?? 'Access denied.');
      } else {
        toast.error(data?.error ?? 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className={`bg-zinc-900 border rounded-2xl p-8 shadow-2xl shadow-black/50 transition-colors ${globalError ? 'border-red-500/30' : 'border-zinc-800'}`}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Welcome back</h1>
          <p className="text-sm text-zinc-400 mt-1">Sign in with your mobile number</p>
        </div>

        {globalError && (
          <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-fade-in">
            <p className="text-sm text-red-400">{globalError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex mt-1.5">
              <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-sm select-none">
                +91
              </span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className="rounded-l-none"
                placeholder="98765 43210"
                error={!!errors.phone}
                autoComplete="tel-national"
                {...register('phone')}
              />
            </div>
            {errors.phone && <p className="text-xs text-red-400 mt-1 animate-fade-in">{errors.phone.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
                Forgot password?
              </Link>
            </div>
            <PasswordInput id="password" error={!!errors.password} autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="text-xs text-red-400 mt-1 animate-fade-in">{errors.password.message}</p>}
          </div>

          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in&hellip;</> : 'Sign in →'}
          </Button>
        </form>

        <p className="text-sm text-zinc-500 text-center mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-violet-400 hover:text-violet-300 transition-colors">Sign up free</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
