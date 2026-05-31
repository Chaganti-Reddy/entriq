// apps/web/app/dashboard/team/page.tsx
// Team management — Admin only. Phone-first invite: lookup by phone, only existing verified accounts.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, Trash2, ShieldCheck, ShieldOff, Loader2,
  Phone, User, Search, CheckCircle2, UserCheck, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/dashboard/page-header';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

interface Member {
  id: string; name: string; mobile: string;
  role: 'admin' | 'co_organizer'; status: 'active' | 'inactive'; created_at: string;
}

interface LookupResult {
  found: boolean; name?: string; sameOrg?: boolean; otherOrg?: boolean; unverified?: boolean;
}

export default function TeamPage() {
  const router   = useRouter();
  const { user } = useAuthStore();
  const qc       = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [phone, setPhone]           = useState('');
  const [lookup, setLookup]         = useState<LookupResult | null>(null);
  const [checking, setChecking]     = useState(false);

  if (user && user.role !== 'admin') {
    router.replace('/dashboard');
    return null;
  }

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['team-members'],
    queryFn:  async () => { const { data } = await api.get('/members'); return data; },
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post('/members/invite', { phone, role: 'co_organizer' }),
    onSuccess: () => {
      toast.success(`+91 ${phone} added to team!`);
      qc.invalidateQueries({ queryKey: ['team-members'] });
      closeInvite();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Invite failed';
      toast.error(msg);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      api.patch(`/members/${id}`, { status }),
    onSuccess: () => { toast.success('Member updated'); qc.invalidateQueries({ queryKey: ['team-members'] }); },
    onError:   () => toast.error('Failed to update member'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`),
    onSuccess: () => { toast.success('Member removed'); qc.invalidateQueries({ queryKey: ['team-members'] }); },
    onError:   () => toast.error('Failed to remove member'),
  });

  function closeInvite() {
    setInviteOpen(false); setPhone(''); setLookup(null); setChecking(false);
  }

  async function handlePhoneCheck() {
    if (!/^\d{10}$/.test(phone)) { toast.error('Enter a valid 10-digit mobile number'); return; }
    setChecking(true);
    try {
      const { data } = await api.get<LookupResult>(`/members/lookup?phone=${encodeURIComponent(phone)}`);
      setLookup(data);
    } catch {
      toast.error('Lookup failed. Try again.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Organisation Team"
        subtitle="Manage org-wide admins and co-organizers. For per-event teams, open an event and click Team."
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" /> Add co-organizer
          </Button>
        }
      />

      {/* ── Invite panel ── */}
      {inviteOpen && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">Add co-organizer</h3>
            <button onClick={closeInvite} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step 1: phone lookup */}
          {!lookup && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="invite-phone">Mobile number</Label>
                <div className="flex gap-2 mt-1.5">
                  <div className="flex flex-1">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-sm select-none">
                      +91
                    </span>
                    <Input
                      id="invite-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      className="rounded-l-none"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      onKeyDown={(e) => e.key === 'Enter' && handlePhoneCheck()}
                      autoFocus
                    />
                  </div>
                  <Button onClick={handlePhoneCheck} disabled={checking || phone.length !== 10}>
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {checking ? 'Checking…' : 'Check'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-zinc-600">The person must already have an Entriq account with a verified phone number.</p>
            </div>
          )}

          {/* Found — can add */}
          {lookup?.found && !lookup.sameOrg && !lookup.otherOrg && !lookup.unverified && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                <UserCheck className="w-5 h-5 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{lookup.name}</p>
                  <p className="text-xs text-zinc-400">+91 {phone} · Verified Entriq account</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              </div>
              <div className="flex gap-3">
                <Button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Add to team
                </Button>
                <Button variant="ghost" size="sm" onClick={closeInvite}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Already in same org */}
          {lookup?.sameOrg && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-sm text-yellow-300">⚠️ This person is already in your team.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closeInvite}>Close</Button>
            </div>
          )}

          {/* In another org */}
          {lookup?.otherOrg && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-sm text-red-300">⚠️ This user already belongs to another organisation and can&apos;t be added.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closeInvite}>Close</Button>
            </div>
          )}

          {/* Phone not verified */}
          {lookup?.found && lookup.unverified && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
              <p className="text-sm text-orange-300">⚠️ This user has not verified their phone number yet. Ask them to complete their account setup first.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={closeInvite}>Close</Button>
            </div>
          )}

          {/* Not found */}
          {lookup && !lookup.found && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
              <p className="text-sm text-zinc-300">
                No account found for <strong className="text-zinc-100">+91 {phone}</strong>.
                Ask them to sign up at Entriq first, then try again.
              </p>
              <div className="flex gap-3 mt-3">
                <Button variant="ghost" size="sm" onClick={() => { setLookup(null); setPhone(''); }}>Try another number</Button>
                <Button variant="ghost" size="sm" onClick={closeInvite}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Members list ── */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No team members yet. Add a co-organizer to get started.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium">Member</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden sm:table-cell">Role</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden md:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <span className="text-xs text-violet-400 font-medium">{m.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-zinc-200 font-medium">{m.name}</p>
                        <p className="text-zinc-500 text-xs flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {m.mobile ? `+91 ${m.mobile}` : '—'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.role === 'admin'
                        ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                        : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                    }`}>
                      {m.role === 'admin' ? 'Admin' : 'Co-organizer'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.status === 'active'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-zinc-700/40 text-zinc-500 border border-zinc-700'
                    }`}>{m.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {m.role !== 'admin' ? (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          title={m.status === 'active' ? 'Deactivate' : 'Activate'}
                          className="text-zinc-500 hover:text-zinc-200 transition-colors"
                          onClick={() => toggleStatusMutation.mutate({ id: m.id, status: m.status === 'active' ? 'inactive' : 'active' })}
                        >
                          {m.status === 'active' ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          title="Remove"
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                          onClick={() => { if (confirm(`Remove ${m.name} from your team?`)) removeMutation.mutate(m.id); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600 pr-2">You</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


