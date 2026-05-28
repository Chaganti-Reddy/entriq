// apps/web/app/(auth)/forgot-password/page.tsx
// Informs users that password reset is handled by their account owner.
// Entriq is a single-org-per-signup product — password reset requires re-signup or admin action.
'use client';

import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/20">
          <Mail className="w-5 h-5 text-violet-400" />
        </div>

        <h1 className="text-xl font-bold text-zinc-100 mb-2">Forgot your password?</h1>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Password resets are not yet self-service. Please contact{' '}
          <span className="text-zinc-200 font-medium">support@entriq.app</span> with your
          registered email address and we'll help you regain access.
        </p>

        <Button asChild className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
