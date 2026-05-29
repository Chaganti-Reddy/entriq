// apps/web/app/(auth)/forgot-password/page.tsx
// Password reset via Supabase — sends a reset link to the user's email.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: data.email });
      setSentEmail(data.email);
      setSent(true);
    } catch {
      // Always show success to prevent email enumeration
      setSentEmail(data.email);
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm animate-slide-up">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-7 h-7 text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 mb-2">Check your email</h1>
          <p className="text-sm text-zinc-400 mb-2 leading-relaxed">
            If an account exists for{' '}
            <span className="text-violet-400 font-medium">{sentEmail}</span>,
            we sent a password reset link.
          </p>
          <p className="text-xs text-zinc-500 mb-6">Check spam if you don't see it.</p>
          <Button asChild className="w-full" variant="outline">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/20">
          <Mail className="w-5 h-5 text-violet-400" />
        </div>
        <h1 className="text-xl font-bold text-zinc-100 mb-1 text-center">Forgot password?</h1>
        <p className="text-sm text-zinc-400 mb-6 text-center leading-relaxed">
          Enter your email and we'll send a reset link.
        </p>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" className="mt-1.5" placeholder="you@example.com"
              error={!!errors.email} autoComplete="email" autoFocus {...register('email')} />
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send reset link →'}
          </Button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
