// apps/web/app/auth/callback/page.tsx
// Email callback is no longer used — phone-based auth replaced email verification.
// Redirect anyone who lands here (old bookmarks, stale links) to login.
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/login'); }, [router]);
  return null;
}


