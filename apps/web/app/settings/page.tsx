// apps/web/app/settings/page.tsx
// User settings — accessible for ALL logged-in users (with or without an org).

'use client';

import { useState, useEffect } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, User, Lock, AlertTriangle, ArrowLeft, Gem, CheckCircle2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

function Section({ icon: Icon, title, subtitle, children }: {
  icon: ElementType; title: string; subtitle: string; children: ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function UserSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated, setAuth, clearAuth } = useAuthStore();

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) router.replace('/login');
  }, [_hasHydrated, isAuthenticated, router]);

  const [name, setName]           = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  useEffect(() => { if (user?.name) setName(user.name); }, [user?.name]);

  const profileMutation = useMutation({
    mutationFn: () => api.patch('/user/profile', { name }),
    onSuccess: ({ data }) => {
      setAuth(data.token, data.refreshToken, data.user);
      toast.success('Profile updated');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to update profile'),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.patch('/user/password', { currentPassword: currentPw, newPassword: newPw }),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to change password'),
  });

  function handlePasswordSubmit() {
    if (!currentPw) { toast.error('Enter your current password'); return; }
    if (newPw.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    passwordMutation.mutate();
  }

  if (!_hasHydrated || !user) return null;

  // Determine back link based on user context
  const backHref = user.role && user.orgStatus === 'approved' ? '/dashboard' : '/my-events';

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Gem className="w-5 h-5 text-violet-500" />
            <span className="font-semibold text-zinc-100">Entriq</span>
          </Link>
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage your account</p>
        </div>

        {/* ── Profile ── */}
        <Section icon={User} title="Profile" subtitle="Update your display name">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="s-name">Display name</Label>
                <Input
                  id="s-name"
                  className="mt-1.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Email address</Label>
                <Input className="mt-1.5 opacity-50 cursor-not-allowed" value={user.email} disabled />
                <p className="text-xs text-zinc-600 mt-1">Email cannot be changed</p>
              </div>
            </div>
            <Button
              onClick={() => profileMutation.mutate()}
              disabled={profileMutation.isPending || !name.trim() || name === user.name}
            >
              {profileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save profile
            </Button>
          </div>
        </Section>

        {/* ── Password ── */}
        <Section icon={Lock} title="Password" subtitle="Change your login password">
          <div className="space-y-4">
            <div>
              <Label htmlFor="s-cur-pw">Current password</Label>
              <PasswordInput
                id="s-cur-pw"
                className="mt-1.5 max-w-sm"
                placeholder="Your current password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="s-new-pw">New password</Label>
                <PasswordInput
                  id="s-new-pw"
                  className="mt-1.5"
                  placeholder="Min 8 characters"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="s-confirm-pw">Confirm new password</Label>
                <PasswordInput
                  id="s-confirm-pw"
                  className="mt-1.5"
                  placeholder="Re-enter new password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
                {confirmPw && newPw !== confirmPw && (
                  <p className="text-xs text-red-400 mt-1">Passwords don&apos;t match</p>
                )}
              </div>
            </div>
            <Button
              onClick={handlePasswordSubmit}
              disabled={passwordMutation.isPending || !currentPw || !newPw || !confirmPw}
            >
              {passwordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Change password
            </Button>
          </div>
        </Section>

        {/* ── Sign out ── */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-red-300">Session</h2>
              <p className="text-xs text-zinc-500">Sign out of your Entriq account</p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Sign out</p>
              <p className="text-xs text-zinc-500">Clears your session on this device</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200 gap-2"
              onClick={() => { clearAuth(); router.push('/login'); }}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
