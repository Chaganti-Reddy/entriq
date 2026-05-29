// apps/web/app/dashboard/events/[id]/team/page.tsx
// Per-event team management. Admin only.
// Assign/remove co-organizers or scanners for a specific event.

'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, Trash2, ArrowLeft, Loader2, Search, User,
  UserCheck, CheckCircle2, X, ScanLine, ShieldCheck, Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PageHeader } from '@/components/dashboard/page-header';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { EventWithCounts } from '@entriq/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventMember {
  id: string;
  role: 'co_organizer' | 'scanner';
  created_at: string;
  user: { id: string; name: string; email: string };
}

interface LookupResult {
  found: boolean;
  name?: string;
  isSuperAdmin?: boolean;
  alreadyAssigned?: boolean;
  otherOrg?: boolean;
  inOurOrg?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventTeamPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen]   = useState(false);
  const [email, setEmail]           = useState('');
  const [role, setRole]             = useState<'co_organizer' | 'scanner'>('co_organizer');
  const [lookup, setLookup]         = useState<LookupResult | null>(null);
  const [checking, setChecking]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [newPassword, setNewPassword] = useState('');

  const isAdmin = user?.role === 'admin';

  // ── Data ──
  const { data: event } = useQuery<EventWithCounts>({
    queryKey: ['event', id],
    queryFn: async () => { const { data } = await api.get(`/events/${id}`); return data; },
  });

  const { data: members = [], isLoading } = useQuery<EventMember[]>({
    queryKey: ['event-members', id],
    queryFn: async () => { const { data } = await api.get(`/events/${id}/members`); return data; },
  });

  // ── Mutations ──
  const assignMutation = useMutation({
    mutationFn: (payload: { email: string; role: string; name?: string; password?: string }) =>
      api.post(`/events/${id}/members`, payload),
    onSuccess: () => {
      toast.success('Member assigned to event!');
      qc.invalidateQueries({ queryKey: ['event-members', id] });
      closePanel();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to assign';
      toast.error(msg);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, newRole }: { memberId: string; newRole: string }) =>
      api.patch(`/events/${id}/members/${memberId}`, { role: newRole }),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['event-members', id] }); },
    onError: () => toast.error('Failed to update role'),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/events/${id}/members/${memberId}`),
    onSuccess: () => { toast.success('Member removed from event'); qc.invalidateQueries({ queryKey: ['event-members', id] }); },
    onError: () => toast.error('Failed to remove member'),
  });

  // ── Helpers ──
  function closePanel() {
    setPanelOpen(false); setEmail(''); setLookup(null);
    setNewName(''); setNewPassword(''); setChecking(false);
    setRole('co_organizer');
  }

  async function handleLookup() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email'); return;
    }
    setChecking(true);
    try {
      const { data } = await api.get<LookupResult>(`/events/${id}/members/lookup?email=${encodeURIComponent(email)}`);
      setLookup(data);
    } catch {
      toast.error('Lookup failed. Try again.');
    } finally {
      setChecking(false);
    }
  }

  function handleAssign() {
    if (lookup?.found && !lookup.isSuperAdmin && !lookup.alreadyAssigned && !lookup.otherOrg) {
      assignMutation.mutate({ email, role });
    } else if (lookup && !lookup.found) {
      if (!newName.trim() || newName.trim().length < 2) { toast.error('Enter a valid name'); return; }
      if (!newPassword || newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
      assignMutation.mutate({ email, role, name: newName.trim(), password: newPassword });
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title={event ? `${event.name} — Team` : 'Event Team'}
        subtitle="Assign co-organizers and scanners to this specific event."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/events/${id}`}>
                <ArrowLeft className="w-4 h-4" /> Back to event
              </Link>
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setPanelOpen(true)}>
                <UserPlus className="w-4 h-4" /> Assign member
              </Button>
            )}
          </div>
        }
      />

      {/* ── Info banner ── */}
      <div className="mb-6 bg-violet-500/5 border border-violet-500/15 rounded-xl p-4 text-sm text-violet-300">
        <p>
          <span className="font-semibold">Per-event team:</span> Members assigned here can only access
          <span className="font-semibold"> this event</span>. Use the{' '}
          <Link href="/dashboard/team" className="underline underline-offset-2 hover:text-violet-200">
            Organisation Team
          </Link>{' '}
          page to manage org-wide admins.
        </p>
      </div>

      {/* ── Assign panel ── */}
      {panelOpen && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">Assign member to event</h3>
            <button onClick={closePanel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Role selector */}
          <div className="mb-4 flex gap-2">
            {(['co_organizer', 'scanner'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  role === r
                    ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                    : 'text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {r === 'co_organizer'
                  ? <><ShieldCheck className="w-3 h-3" /> Co-organizer</>
                  : <><ScanLine className="w-3 h-3" /> Scanner</>}
              </button>
            ))}
          </div>

          {/* Step 1 — email check */}
          {!lookup && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="assign-email">Email address</Label>
                <Input
                  id="assign-email"
                  type="email"
                  className="mt-1.5"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  autoFocus
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleLookup} disabled={checking}>
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {checking ? 'Checking…' : 'Check'}
                </Button>
              </div>
            </div>
          )}

          {/* Already assigned */}
          {lookup?.alreadyAssigned && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-sm text-yellow-300">⚠️ <strong>{lookup.name}</strong> is already assigned to this event.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Super admin */}
          {lookup?.isSuperAdmin && (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4">
              <p className="text-sm text-violet-300">⚡ Super Admin accounts cannot be assigned as event members.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Other org */}
          {lookup?.otherOrg && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-sm text-red-300">⚠️ This user belongs to another organisation.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Existing user — assign directly */}
          {lookup?.found && !lookup.isSuperAdmin && !lookup.alreadyAssigned && !lookup.otherOrg && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                <UserCheck className="w-5 h-5 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{lookup.name}</p>
                  <p className="text-xs text-zinc-400">
                    {email}
                    {lookup.inOurOrg
                      ? ' · Org member'
                      : ' · Has an Entriq account'}
                  </p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleAssign} disabled={assignMutation.isPending}>
                  {assignMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Assign to event
                </Button>
                <Button variant="ghost" size="sm" onClick={closePanel}>Cancel</Button>
              </div>
            </div>
          )}

          {/* New user — create account */}
          {lookup && !lookup.found && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded-xl p-3">
                <User className="w-4 h-4 text-zinc-500 shrink-0" />
                <p className="text-sm text-zinc-400">
                  <span className="text-zinc-200">{email}</span> doesn&apos;t have an account yet.
                  A new account will be created.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="new-name">Full name *</Label>
                  <Input id="new-name" className="mt-1.5" placeholder="Jane Doe" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="new-password">Temporary password *</Label>
                  <PasswordInput id="new-password" className="mt-1.5" placeholder="Min 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleAssign} disabled={assignMutation.isPending}>
                  {assignMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create &amp; assign
                </Button>
                <Button variant="ghost" size="sm" onClick={closePanel}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Members list ── */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No members assigned to this event yet.</p>
          {isAdmin && (
            <Button size="sm" className="mt-4" onClick={() => setPanelOpen(true)}>
              <UserPlus className="w-4 h-4" /> Assign first member
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium">Member</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden sm:table-cell">Role</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <span className="text-xs text-violet-400 font-medium">{m.user.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-zinc-200 font-medium">{m.user.name}</p>
                        <p className="text-zinc-500 text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{m.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {isAdmin ? (
                      <div className="flex gap-2">
                        {(['co_organizer', 'scanner'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => m.role !== r && updateRoleMutation.mutate({ memberId: m.id, newRole: r })}
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                              m.role === r
                                ? r === 'co_organizer'
                                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                                : 'text-zinc-600 border-zinc-700 hover:border-zinc-500 hover:text-zinc-400'
                            }`}
                          >
                            {r === 'co_organizer' ? <><ShieldCheck className="w-3 h-3" /> Co-organizer</> : <><ScanLine className="w-3 h-3" /> Scanner</>}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        m.role === 'co_organizer'
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {m.role === 'co_organizer' ? 'Co-organizer' : 'Scanner'}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          title="Remove from event"
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                          onClick={() => {
                            if (confirm(`Remove ${m.user.name} from this event?`)) {
                              removeMutation.mutate(m.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
