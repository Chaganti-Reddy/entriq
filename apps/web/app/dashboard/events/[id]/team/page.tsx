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
  UserCheck, CheckCircle2, X, ScanLine, ShieldCheck, Phone, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/dashboard/page-header';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import type { EventWithCounts } from '@entriq/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventMember {
  id: string;
  role: 'co_organizer' | 'scanner' | 'leader';
  created_at: string;
  user: { id: string; name: string; mobile?: string };
}

interface LookupResult {
  found: boolean;
  name?: string;
  unverified?: boolean;
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
  const [phone, setPhone]           = useState('');
  const [role, setRole] = useState<'co_organizer' | 'scanner' | 'leader'>('co_organizer');
  const [lookup, setLookup]         = useState<LookupResult | null>(null);
  const [checking, setChecking]     = useState(false);

  // Demotion warning state
  const [demoteWarning, setDemoteWarning] = useState<{
    memberId: string; newRole: string; pendingReferrals: number; memberName: string;
  } | null>(null);

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
    mutationFn: (payload: { phone: string; role: string }) =>
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
    mutationFn: ({ memberId, newRole, autoAcknowledge }: { memberId: string; newRole: string; autoAcknowledge?: boolean }) =>
      api.patch(`/events/${id}/members/${memberId}`, { role: newRole, autoAcknowledge }),
    onSuccess: () => {
      toast.success('Role updated');
      qc.invalidateQueries({ queryKey: ['event-members', id] });
      qc.invalidateQueries({ queryKey: ['registrations', id] });
      setDemoteWarning(null);
    },
    onError: (err: unknown) => {
      const res = (err as { response?: { data?: { warning?: string; pendingReferrals?: number } } })?.response;
      if (res?.data?.warning === 'leader_has_pending_referrals') {
        // API returned 409 — surface the warning dialog (will be set by the caller)
        return;
      }
      toast.error('Failed to update role');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/events/${id}/members/${memberId}`),
    onSuccess: () => { toast.success('Member removed from event'); qc.invalidateQueries({ queryKey: ['event-members', id] }); },
    onError: () => toast.error('Failed to remove member'),
  });

  // ── Helpers ──
  function closePanel() {
    setPanelOpen(false); setPhone(''); setLookup(null);
    setChecking(false); setRole('co_organizer');
  }

  async function handleRoleChange(member: EventMember, newRole: 'co_organizer' | 'scanner' | 'leader') {
    if (member.role === newRole) return;
    // Optimistically attempt; backend returns 409 if demotion has pending referrals
    try {
      await api.patch(`/events/${id}/members/${member.id}`, { role: newRole });
      toast.success('Role updated');
      qc.invalidateQueries({ queryKey: ['event-members', id] });
      qc.invalidateQueries({ queryKey: ['registrations', id] });
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { warning?: string; pendingReferrals?: number } } })?.response;
      if (res?.status === 409 && res.data?.warning === 'leader_has_pending_referrals') {
        setDemoteWarning({
          memberId: member.id,
          newRole,
          pendingReferrals: res.data.pendingReferrals ?? 0,
          memberName: member.user.name,
        });
        return;
      }
      toast.error('Failed to update role');
    }
  }

  async function handleLookup() {
    if (!/^\d{10}$/.test(phone)) {
      toast.error('Enter a valid 10-digit mobile number'); return;
    }
    setChecking(true);
    try {
      const { data } = await api.get<LookupResult>(`/events/${id}/members/lookup?phone=${encodeURIComponent(phone)}`);
      setLookup(data);
    } catch {
      toast.error('Lookup failed. Try again.');
    } finally {
      setChecking(false);
    }
  }

  function handleAssign() {
    if (lookup?.found && !lookup.unverified && !lookup.alreadyAssigned && !lookup.otherOrg) {
      assignMutation.mutate({ phone, role });
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
          <div className="mb-4 flex gap-2 flex-wrap">
            {(['co_organizer', 'leader', 'scanner'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  role === r
                    ? r === 'leader'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                    : 'text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {r === 'co_organizer' ? <><ShieldCheck className="w-3 h-3" /> Co-organizer</>
                 : r === 'leader'     ? <><Star className="w-3 h-3" /> Leader</>
                 :                      <><ScanLine className="w-3 h-3" /> Scanner</>}
              </button>
            ))}
          </div>
          {role === 'leader' && (
            <p className="text-xs text-amber-300/70 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2 mb-4">
              Leaders can approve registrants and see referral data. They also appear in the "Referred by" dropdown on the registration form.
            </p>
          )}

          {/* Step 1 — phone check */}
          {!lookup && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="assign-phone">Mobile number</Label>
                <div className="flex mt-1.5">
                  <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-sm select-none">+91</span>
                  <Input
                    id="assign-phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className="rounded-l-none"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleLookup} disabled={checking}>
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {checking ? 'Checking...' : 'Check'}
                </Button>
              </div>
            </div>
          )}

          {/* Already assigned */}
          {lookup?.alreadyAssigned && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-sm text-yellow-300">&#9888; <strong>{lookup.name}</strong> is already assigned to this event.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Unverified phone */}
          {lookup?.unverified && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-sm text-yellow-300">&#9888; This user has not verified their phone number yet. Ask them to complete verification at entriq.app/verify-phone.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Other org */}
          {lookup?.otherOrg && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-sm text-red-300">&#9888; This user belongs to another organisation.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Not found */}
          {lookup && !lookup.found && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
              <p className="text-sm text-zinc-300">No Entriq account found for +91 {phone}. Ask them to sign up at entriq.app first.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closePanel}>Close</Button>
            </div>
          )}

          {/* Existing user — assign directly */}
          {lookup?.found && !lookup.unverified && !lookup.alreadyAssigned && !lookup.otherOrg && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                <UserCheck className="w-5 h-5 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{lookup.name}</p>
                  <p className="text-xs text-zinc-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />+91 {phone}
                    {lookup.inOurOrg ? ' · Org member' : ' · Has an Entriq account'}
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
                        <p className="text-zinc-500 text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{(m.user as any).mobile ? `+91 ${(m.user as any).mobile}` : 'No phone'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {isAdmin ? (
                      <div className="flex gap-2 flex-wrap">
                        {(['co_organizer', 'leader', 'scanner'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => handleRoleChange(m, r)}
                            disabled={updateRoleMutation.isPending}
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                              m.role === r
                                ? r === 'co_organizer' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                                  : r === 'leader'     ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                                  :                      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                                : 'text-zinc-600 border-zinc-700 hover:border-zinc-500 hover:text-zinc-400'
                            }`}
                          >
                            {r === 'co_organizer' ? <><ShieldCheck className="w-3 h-3" /> Co-organizer</>
                             : r === 'leader'      ? <><Star className="w-3 h-3" /> Leader</>
                             :                       <><ScanLine className="w-3 h-3" /> Scanner</>}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        m.role === 'co_organizer' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                        : m.role === 'leader'     ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                        :                           'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {m.role === 'co_organizer' ? 'Co-organizer' : m.role === 'leader' ? 'Leader' : 'Scanner'}
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

      {/* ── Leader demotion warning dialog ── */}
      {demoteWarning && (
        <ConfirmDialog
          open={true}
          title="Leader has pending referrals"
          description={
            `${demoteWarning.memberName} is being changed from Leader to ${demoteWarning.newRole === 'co_organizer' ? 'Co-organizer' : 'Scanner'}, ` +
            `but they have ${demoteWarning.pendingReferrals} unacknowledged referral${demoteWarning.pendingReferrals !== 1 ? 's' : ''}. ` +
            `Auto-acknowledge all of them now and change the role, or cancel to keep them as Leader.`
          }
          confirmLabel={`Auto-acknowledge ${demoteWarning.pendingReferrals} & change role`}
          loading={updateRoleMutation.isPending}
          onConfirm={() =>
            updateRoleMutation.mutate({
              memberId: demoteWarning.memberId,
              newRole: demoteWarning.newRole,
              autoAcknowledge: true,
            })
          }
          onCancel={() => setDemoteWarning(null)}
        />
      )}
    </div>
  );
}
