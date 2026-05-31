// apps/web/app/super-admin/orgs/[id]/page.tsx
// Super admin: rich org detail — tabbed view of overview, events (+registrants), members.

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Building2, Users, CalendarDays, CheckCircle2, XCircle,
  AlertCircle, Loader2, Mail, Phone, MapPin, Briefcase, ChevronDown,
  ChevronRight, QrCode, UserCheck, Clock, Info, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { saApi } from '@/lib/saApi';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/utils';

type OrgStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
type Tab = 'overview' | 'events' | 'members';

interface Registrant {
  id: string; name: string; surname: string; email: string; mobile: string;
  state: string; city: string; profession: string; other_info?: string;
  unique_code: string; status: 'not_approved' | 'approved'; registered_at: string;
}

interface OrgDetail {
  org: { id: string; name: string; email: string | null; status: OrgStatus; rejection_reason: string | null; created_at: string };
  members: { id: string; name: string; mobile: string; role: string; status: string; created_at: string }[];
  events: {
    id: string; name: string; slug: string; description: string | null;
    date: string | null; location: string | null; is_active: boolean;
    created_at: string; registration_count: number; checkin_count: number;
  }[];
  registration_count: number;
}

const statusBadge: Record<OrgStatus, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  approved:  { label: 'Approved',  cls: 'bg-green-500/10  text-green-400  border-green-500/20' },
  rejected:  { label: 'Rejected',  cls: 'bg-red-500/10    text-red-400    border-red-500/20' },
  suspended: { label: 'Suspended', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

function EventRow({ ev, onDeleted }: { ev: OrgDetail['events'][number]; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const qc = useQueryClient();
  const { data: registrants, isFetching } = useQuery<Registrant[]>({
    queryKey: ['sa-event-regs', ev.id],
    queryFn:  async () => { const { data } = await saApi.get(`/super-admin/events/${ev.id}/registrations`); return data; },
    enabled:  open,
    staleTime: 30_000,
  });

  const deleteEventMutation = useMutation({
    mutationFn: () => saApi.delete(`/super-admin/events/${ev.id}`),
    onSuccess: () => {
      toast.success(`Event "${ev.name}" deleted.`);
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      onDeleted(ev.id);
    },
    onError: () => toast.error('Failed to delete event.'),
  });

  return (
    <div className="border-b border-zinc-800/50 last:border-0">
      <button className="w-full flex items-start gap-3 px-4 py-4 hover:bg-zinc-800/30 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}>
        <div className="mt-0.5 shrink-0 text-zinc-500">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-medium text-zinc-200">{ev.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              ev.is_active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-zinc-700/40 text-zinc-500 border-zinc-700'
            }`}>{ev.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
            <span className="font-mono">/{ev.slug}</span>
            {ev.date && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatDateShort(ev.date)}</span>}
            {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>}
          </div>
          {ev.description && <p className="text-xs text-zinc-600 mt-1 truncate">{ev.description}</p>}
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className="text-sm font-semibold text-zinc-200">{ev.registration_count}</div>
          <div className="text-[10px] text-zinc-500">registered</div>
          <div className="text-[10px] text-green-400">{ev.checkin_count} checked in</div>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true); }}
            className="mt-2 text-zinc-600 hover:text-red-400 transition-colors"
            title="Delete event"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </button>
      <ConfirmDialog
        open={deleteConfirm}
        title={`Delete "${ev.name}"?`}
        description={`This will permanently delete the event and all ${ev.registration_count} registrations. Cannot be undone.`}
        confirmLabel="Delete Event"
        loading={deleteEventMutation.isPending}
        onConfirm={() => deleteEventMutation.mutate()}
        onCancel={() => setDeleteConfirm(false)}
      />
      {open && (
        <div className="bg-zinc-950/60 border-t border-zinc-800/50 px-4 py-3">
          {isFetching ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : !registrants?.length ? (
            <p className="text-xs text-zinc-600 py-4 text-center">No registrations yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-3">{registrants.length} Registrant{registrants.length !== 1 ? 's' : ''}</p>
              {registrants.map((r) => (
                <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{r.name} {r.surname}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {r.email && <span className="flex items-center gap-1 text-xs text-zinc-500"><Mail className="w-3 h-3" />{r.email}</span>}
                      <span className="flex items-center gap-1 text-xs text-zinc-500"><Phone className="w-3 h-3" />+91 {r.mobile}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="flex items-center gap-1 text-xs text-zinc-500"><MapPin className="w-3 h-3" />{r.city}, {r.state}</span>
                      <span className="flex items-center gap-1 text-xs text-zinc-500"><Briefcase className="w-3 h-3" />{r.profession}</span>
                    </div>
                    {r.other_info && <p className="text-xs text-zinc-600 mt-1"><Info className="w-3 h-3 inline mr-1" />{r.other_info}</p>}
                  </div>
                  <div className="sm:text-right">
                    <div className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      r.status === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                    }`}>
                      {r.status === 'approved' ? <UserCheck className="w-3 h-3" /> : <QrCode className="w-3 h-3" />}
                      {r.status === 'approved' ? 'Checked in' : 'Registered'}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1 flex items-center gap-1 sm:justify-end"><Clock className="w-3 h-3" />{formatDateShort(r.registered_at)}</p>
                    <p className="font-mono text-[10px] text-zinc-600 mt-1">{r.unique_code}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrgDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();
  const [tab, setTab]                         = useState<Tab>('overview');
  const [rejectReason, setRejectReason]       = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState(false);
  const [localEvents, setLocalEvents]         = useState<OrgDetail['events'] | null>(null);

  const { data, isLoading } = useQuery<OrgDetail>({
    queryKey: ['sa-org', id],
    queryFn:  async () => { const { data } = await saApi.get(`/super-admin/orgs/${id}`); return data; },
  });

  useEffect(() => {
    if (data?.events) setLocalEvents(data.events);
  }, [data?.events]);

  const statusMutation = useMutation({
    mutationFn: ({ status, reason }: { status: OrgStatus; reason?: string }) =>
      saApi.patch(`/super-admin/orgs/${id}/status`, { status, rejectionReason: reason }),
    onSuccess: (_, vars) => {
      toast.success(`Organisation ${vars.status}`);
      qc.invalidateQueries({ queryKey: ['sa-org', id] });
      qc.invalidateQueries({ queryKey: ['sa-orgs'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      setShowRejectInput(false);
    },
    onError: () => toast.error('Failed to update status'),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: () => saApi.delete(`/super-admin/orgs/${id}`),
    onSuccess: () => {
      toast.success('Organisation deleted.');
      qc.invalidateQueries({ queryKey: ['sa-orgs'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      router.replace('/super-admin/orgs');
    },
    onError: () => toast.error('Failed to delete organisation.'),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!data)     return <div className="py-16 text-center text-zinc-500">Organisation not found.</div>;

  const { org, members, registration_count } = data;
  const events = localEvents ?? data.events;
  const badge = statusBadge[org.status];
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'events',   label: 'Events',  count: events.length },
    { id: 'members',  label: 'Members', count: members.length },
  ];

  return (
    <div>
      <button onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to organisations
      </button>

      {/* Org header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-100">{org.name}</h1>
                <p className="text-sm text-zinc-500 flex items-center gap-1"><Mail className="w-3 h-3" />{org.email ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>{badge.label}</span>
              <span className="text-xs text-zinc-600 flex items-center gap-1"><Clock className="w-3 h-3" />Joined {formatDateShort(org.created_at)}</span>
            </div>
            {org.rejection_reason && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><Info className="w-3 h-3" />Rejection: {org.rejection_reason}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {org.status === 'pending' && (<>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: 'approved' })}><CheckCircle2 className="w-4 h-4" /> Approve</Button>
              <Button size="sm" variant="danger" onClick={() => setShowRejectInput(!showRejectInput)}>
                <XCircle className="w-4 h-4" /> Reject</Button>
            </>)}
            {org.status === 'approved' && (
              <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ status: 'suspended' })}>
                <AlertCircle className="w-4 h-4" /> Suspend</Button>
            )}
            {(org.status === 'rejected' || org.status === 'suspended') && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ status: 'approved' })}><CheckCircle2 className="w-4 h-4" /> Re-approve</Button>
            )}
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-500 text-white ml-auto"
              onClick={() => setDeleteConfirm(true)}
              disabled={deleteOrgMutation.isPending}
            >
              <Trash2 className="w-4 h-4" /> Delete Org
            </Button>
          </div>
        </div>
        {showRejectInput && (
          <div className="mt-4 border-t border-zinc-800 pt-4">
            <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-red-500/50"
              rows={2} placeholder="Reason for rejection (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className="flex gap-3 mt-3">
              <button className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ status: 'rejected', reason: rejectReason })}>
                {statusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Confirm reject'}
              </button>
              <button className="px-4 py-1.5 bg-zinc-800 text-zinc-300 text-sm rounded-lg"
                onClick={() => { setShowRejectInput(false); setRejectReason(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Members',       value: members.length,     icon: Users },
          { label: 'Events',        value: events.length,      icon: CalendarDays },
          { label: 'Registrations', value: registration_count, icon: UserCheck },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-zinc-100 mt-1">{value}</p>
            <Icon className="w-4 h-4 text-zinc-600 mt-1" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6 w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                tab === t.id ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-800 text-zinc-600'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Organisation details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {[
                ['Name', org.name], ['Contact email', org.email ?? '—'],
                ['Total events', String(events.length)], ['Total registrations', String(registration_count)],
                ['Joined', formatDateShort(org.created_at)],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between py-2.5 border-b border-zinc-800/50 text-sm">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-zinc-200">{val}</span>
                </div>
              ))}
            </div>
          </div>
          {members.filter((m) => m.role === 'admin').map((m) => (
            <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Admin</h3>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <span className="text-sm text-violet-400 font-medium">{m.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{m.name}</p>
                  <p className="text-xs text-zinc-500 flex items-center gap-1"><Phone className="w-3 h-3" />{m.mobile ? `+91 ${m.mobile}` : '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Events */}
      {tab === 'events' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {events.length === 0
            ? <p className="text-zinc-600 text-sm px-4 py-8 text-center">No events created yet.</p>
            : events.map((ev) => <EventRow key={ev.id} ev={ev} onDeleted={(deletedId) => setLocalEvents((prev) => (prev ?? data.events).filter((e) => e.id !== deletedId))} />)}
        </div>
      )}

      {/* Tab: Members */}
      {tab === 'members' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {members.length === 0
            ? <p className="text-zinc-600 text-sm px-4 py-8 text-center">No members.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide">Member</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Role</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide hidden md:table-cell">Status</th>
                    <th className="text-right px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide hidden md:table-cell">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-zinc-800/50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                            <span className="text-xs text-violet-400 font-medium">{m.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-zinc-200 font-medium">{m.name}</p>
                            <p className="text-zinc-500 text-xs">{m.mobile ? `+91 ${m.mobile}` : '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                          m.role === 'admin' ? 'bg-violet-500/15 text-violet-400 border-violet-500/20' : 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                        }`}>{m.role === 'admin' ? 'Admin' : 'Co-organizer'}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                          m.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-zinc-700/40 text-zinc-500 border-zinc-700'
                        }`}>{m.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs hidden md:table-cell">{formatDateShort(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Organisation"
        description={`Permanently delete "${org.name}" including all its events, registrations, and members? This cannot be undone.`}
        confirmLabel="Delete Organisation"
        loading={deleteOrgMutation.isPending}
        onConfirm={() => deleteOrgMutation.mutate()}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
