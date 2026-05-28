// apps/web/app/auth/callback/page.tsx
// Handles Supabase email verification redirect.
// Supabase redirects here with tokens in URL hash after user clicks verify link:
//   /auth/callback#access_token=xxx&refresh_token=xxx&type=signup
// We exchange the Supabase access token for our custom JWT (with org role info).
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gem, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { AuthResponse } from '@entriq/shared';

type State = 'loading' | 'success' | 'error';

export default function AuthCallbackPage() {
  const router        = useRouter();
  const { setAuth }   = useAuthStore();
  const [state, setState]   = useState<State>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function handleCallback() {
      try {
        // Supabase puts tokens in URL hash fragment (not query string — never sent to server)
        const hash   = window.location.hash.slice(1); // remove leading #
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const type        = params.get('type'); // 'signup', 'recovery', etc.

        if (!accessToken) {
          setErrorMsg('No verification token found in URL. The link may have expired.');
          setState('error');
          return;
        }

        // Exchange Supabase token for our JWT
        const { data: res } = await api.post<AuthResponse>('/auth/exchange', { accessToken });
        setAuth(res.token, res.refreshToken, res.user);

        // Clear the hash from URL (tokens should not stay in browser history)
        window.history.replaceState(null, '', window.location.pathname);

        setState('success');

        // Route based on user type
        setTimeout(() => {
          if (res.user.role && res.user.orgStatus) {
            if (res.user.orgStatus === 'approved') {
              router.push('/dashboard');
            } else {
              router.push('/pending-approval');
            }
          } else {
            router.push('/my-events');
          }
        }, 1500);
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? 'Verification failed. The link may have expired.';
        setErrorMsg(msg);
        setState('error');
      }
    }

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full animate-slide-up">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Gem className="w-5 h-5 text-violet-500" />
          <span className="font-semibold text-zinc-300">Entriq</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          {state === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 text-violet-400 animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Verifying your email…</h2>
              <p className="text-sm text-zinc-500">Just a moment</p>
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Email verified!</h2>
              <p className="text-sm text-zinc-400">Redirecting you now…</p>
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Verification failed</h2>
              <p className="text-sm text-zinc-400 mb-6">{errorMsg}</p>
              <div className="space-y-2">
                <Button className="w-full" asChild>
                  <Link href="/signup">Try signing up again</Link>
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/login">Go to login</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
