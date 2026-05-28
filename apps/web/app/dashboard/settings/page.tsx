// apps/web/app/dashboard/settings/page.tsx
// Settings: profile name, password change, org settings (admin), danger zone.

'use client';

import { useState, useEffect } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, User, Lock, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PageHeader } from '@/components/dashboard/page-header';
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

export default function SettingsPage() {
  const { user, setAuth, token, refreshToken } = useAuthStore();

  // Profile state
  const [name, setName]   = useState('');
  useEffect(() => { if (user?.name) setName(user.name); }, [user?.name]);

  // Password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Org state
  const [orgName, setOrgName]           = useState('');
  const [contactEmail, setContactEmail] = useState('');
  useEffect(() => {
    if (user?.orgName)  setOrgName(user.orgName);
  }, [user?.orgName]);

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

  const orgMutation = useMutation({
    mutationFn: () => api.patch('/user/org', {
      ...(orgName !== user?.orgName ? { orgName } : {}),
      ...(contactEmail ? { contactEmail } : {}),
    }),
    onSuccess: ({ data }) => {
      setAuth(data.token, data.refreshToken, data.user);
      setContactEmail('');
      toast.success('Organisation updated');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to update organisation'),
  });

  function handlePasswordSubmit() {
    if (!currentPw) { toast.error('Enter your current password'); return; }
    if (newPw.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    passwordMutation.mutate();
  }

  function handleOrgSubmit() {
    if (!orgName.trim() || orgName.trim().length < 2) { toast.error('Organisation name must be at least 2 characters'); return; }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { toast.error('Enter a valid email'); return; }
    orgMutation.mutate();
  }

  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your profile and organisation" />

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
              <Input
                className="mt-1.5 opacity-50 cursor-not-allowed"
                value={user?.email ?? ''}
                disabled
              />
              <p className="text-xs text-zinc-600 mt-1">Email cannot be changed</p>
            </div>
          </div>
          <Button
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending || !name.trim() || name === user?.name}
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

      {/* ── Organisation (admin only) ── */}
      {isAdmin && (
        <Section icon={Building2} title="Organisation" subtitle="Update your organisation details">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="s-org-name">Organisation name</Label>
                <Input
                  id="s-org-name"
                  className="mt-1.5"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="s-contact-email">Contact email</Label>
                <Input
                  id="s-contact-email"
                  type="email"
                  className="mt-1.5"
                  placeholder="Leave blank to keep current"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
                <p className="text-xs text-zinc-600 mt-1">Only fill if you want to change it</p>
              </div>
            </div>
            <Button
              onClick={handleOrgSubmit}
              disabled={orgMutation.isPending || (!orgName.trim())}
            >
              {orgMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save organisation
            </Button>
          </div>
        </Section>
      )}

      {/* ── Danger zone ── */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
            <p className="text-xs text-zinc-500">Irreversible actions — proceed with caution</p>
          </div>
        </div>
        <div className="space-y-3">
          {user?.role === 'co_organizer' && (
            <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">Leave organisation</p>
                <p className="text-xs text-zinc-500">You will lose access to this org&apos;s dashboard</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to leave this organisation?')) {
                    toast.info('Contact your org admin to be removed from the team.');
                  }
                }}
              >
                Leave org
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Sign out of all devices</p>
              <p className="text-xs text-zinc-500">Revokes your current session token</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
              onClick={() => {
                useAuthStore.getState().clearAuth();
                window.location.href = '/login';
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

