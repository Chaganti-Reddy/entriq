// apps/web/app/super-admin/settings/page.tsx
// Super admin settings: view account info, change password, sign out.

'use client';

import { useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Lock, ShieldCheck, AlertTriangle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PageHeader } from '@/components/dashboard/page-header';
import { useSuperAdminStore } from '@/stores/superAdminAuth';
import { saApi } from '@/lib/saApi';

function Section({ icon: Icon, title, subtitle, children }: {
  icon: ElementType; title: string; subtitle: string; children: ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-red-400" />
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

export default function SASettingsPage() {
  const { clearAuth } = useSuperAdminStore();

  // Decode name/email from the stored token
  let adminName  = 'Super Admin';
  let adminEmail = '';
  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('entriq_sa_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        adminName  = payload.name  ?? adminName;
        adminEmail = payload.email ?? adminEmail;
      }
    } catch {}
  }

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const passwordMutation = useMutation({
    mutationFn: () => saApi.patch('/super-admin/password', { currentPassword: currentPw, newPassword: newPw }),
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

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your super admin account" />

      {/* ── Account info ── */}
      <Section icon={ShieldCheck} title="Account" subtitle="Your super admin account details">
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Name</span>
            <span className="text-sm text-zinc-200 font-medium">{adminName}</span>
          </div>
          <div className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Email</span>
            <span className="text-sm text-zinc-200">{adminEmail}</span>
          </div>
          <div className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Role</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-medium">
              Super Admin
            </span>
          </div>
          <p className="text-xs text-zinc-600">Name and email are managed directly in the database.</p>
        </div>
      </Section>

      {/* ── Password ── */}
      <Section icon={Lock} title="Password" subtitle="Change your super admin password">
        <div className="space-y-4">
          <div>
            <Label htmlFor="sa-cur-pw">Current password</Label>
            <PasswordInput
              id="sa-cur-pw"
              className="mt-1.5 max-w-sm"
              placeholder="Your current password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sa-new-pw">New password</Label>
              <PasswordInput
                id="sa-new-pw"
                className="mt-1.5"
                placeholder="Min 8 characters"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sa-confirm-pw">Confirm new password</Label>
              <PasswordInput
                id="sa-confirm-pw"
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

      {/* ── Danger zone ── */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">Session</h2>
            <p className="text-xs text-zinc-500">Sign out of the super admin panel</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <div>
            <p className="text-sm font-medium text-zinc-200">Sign out</p>
            <p className="text-xs text-zinc-500">Clears your super admin session token</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-200 gap-2"
            onClick={() => { clearAuth(); window.location.href = '/super-admin/login'; }}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
