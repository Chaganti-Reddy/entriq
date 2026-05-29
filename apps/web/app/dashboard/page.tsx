// apps/web/app/dashboard/page.tsx
// Dashboard home: stats + events list + create-org CTA + external event assignments
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Users, CheckCircle2, Plus, ArrowRight,
  Building2, ScanLine, ShieldCheck, Loader2, X, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PageHeader } from '@/components/dashboard/page-header';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { formatDateShort } from '@/lib/utils';
import type { EventWithCounts, AuthResponse } from '@entriq/shared';

interface EventAssignment {
  id: string;
  role: 'co_organizer' | 'scanner';
  event: { id: string; name: string; slug: string; date: string | null; location: string | null; is_active: boolean };
  org: { id: string; name: string };
}

export default function DashboardPage() {
  const { user, setAuth } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin       = user?.role === 'admin';
  const isEventMember = (user as any)?.isEventMember === true;

  // Create org panel state
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [orgName, setOrgName]             = useState('');
  const [contactEmail, setContactEmail]   = useState('');
  const [deleteEventTarget, setDeleteEventTarget] = useState<EventWithCounts | null>(null);

  // ── Events for current org context ──
  const { data: events, isLoading } = useQuery<EventWithCounts[]>({
    queryKey: ['events'],
    queryFn:  async () => { const { data } = await api.get('/events'); return data; },
    refetchInterval: 30_000,
  });

  // ── External event assignments (from OTHER orgs) ──
  // Shown to org members who are also assigned in another org's event.
  // For event-only members, their main events list already covers this.
  const { data: allAssignments } = useQuery<EventAssignment[]>({
    queryKey: ['event-assignments'],
    queryFn:  async () => { const { data } = await api.get('/user/event-assignments'); return data; },
    enabled:  !isEventMember, // event-only members see their events through the main list
  });

  const externalAssignments = (allAssignments ?? []).filter(
    (a) => a.org?.id !== user?.orgId
  );

  // ── Create org mutation ──
  const createOrgMutation = useMutation({
    mutationFn: (payload: { orgName: string; contactEmail: string }) =>
      api.post<AuthResponse>('/user/create-org', payload),
    onSuccess: ({ data }) => {
      setAuth(data.token, data.refreshToken, data.user);
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success('Organisation created! Awaiting approval.');
      setCreateOrgOpen(false);
      setOrgName(''); setContactEmail('');
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Failed to create organisation';
      toast.error(msg);
    },
  });

  // ── Delete event mutation (admin only) ──
  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => api.delete(`/events/${eventId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success('Event deleted.');
      setDeleteEventTarget(null);
    },
    onError: () => toast.error('Failed to delete event.'),
  });

  function handleCreateOrg() {
    if (!orgName.trim() || orgName.trim().length < 2) { toast.error('Enter a valid organisation name'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { toast.error('Enter a valid contact email'); return; }
    createOrgMutation.mutate({ orgName: orgName.trim(), contactEmail });
  }

  const totalRegistrations = events?.reduce((s, e) => s + e.registration_count, 0) ?? 0;
  const totalCheckins      = events?.reduce((s, e) => s + e.checkin_count, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.name ?? '…'} 👋`}
        subtitle={isEventMember
          ? 'Here are your assigned events.'
          : "Here's what's happening across your events."}
        actions={
          isAdmin ? (
            <Button asChild size="sm">
              <Link href="/dashboard/events/new">
                <Plus className="w-4 h-4" /> New event
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* ── Create Org CTA — for event-only members ── */}
      {isEventMember && !createOrgOpen && (
        <div className="mb-6 bg-violet-500/5 border border-violet-500/15 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200">Want to run your own events?</p>
              <p className="text-xs text-zinc-500 mt-0.5">Create an organisation to manage events, teams, and check-ins.</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setCreateOrgOpen(true)} className="shrink-0">
            <Building2 className="w-4 h-4" /> Create Organisation
          </Button>
        </div>
      )}

      {/* ── Create Org form panel ── */}
      {isEventMember && createOrgOpen && (
        <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">Create your Organisation</h3>
            <button onClick={() => setCreateOrgOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <Label htmlFor="org-name">Organisation name *</Label>
              <Input
                id="org-name"
                className="mt-1.5"
                placeholder="My Events Co."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="org-email">Contact email *</Label>
              <Input
                id="org-email"
                type="email"
                className="mt-1.5"
                placeholder="contact@myorg.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            Your organisation will be reviewed by the platform admin before activation. You can still manage your existing event assignments while waiting.
          </p>
          <div className="flex gap-3">
            <Button onClick={handleCreateOrg} disabled={createOrgMutation.isPending}>
              {createOrgMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit for approval
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreateOrgOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Stats — hidden for event-only members (they see per-event stats) ── */}
      {!isEventMember && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="Events"           value={events?.length ?? 0}  icon={CalendarDays} accentColor="violet" />
          <StatCard label="Total registered" value={totalRegistrations}   icon={Users}        accentColor="default" />
          <StatCard
            label="Total checked in"
            value={totalCheckins}
            icon={CheckCircle2}
            accentColor="green"
            sub={totalRegistrations > 0 ? `${Math.round((totalCheckins / totalRegistrations) * 100)}% check-in rate` : undefined}
          />
        </div>
      )}

      {/* ── Your Events (org context or event-only assigned events) ── */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Your Events</h2>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : !events?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="No events yet"
            description={
              isAdmin
                ? 'Create your first event to start collecting registrations and managing check-ins.'
                : isEventMember
                  ? 'You have not been assigned to any events yet.'
                  : 'No events have been created yet. Ask your admin to create one.'
            }
            action={
              isAdmin ? (
                <Button asChild><Link href="/dashboard/events/new">Create event →</Link></Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition-colors group relative"
              >
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="block pr-10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-zinc-100">{event.name}</span>
                        <StatusBadge status={event.is_active ? 'active' : 'inactive'} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-400">
                        {event.date     && <span>📅 {formatDateShort(event.date)}</span>}
                        {event.location && <span>📍 {event.location}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500 mt-2">
                        <span>{event.registration_count} registered</span>
                        <span>·</span>
                        <span>{event.checkin_count} checked in</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0 mt-1" />
                  </div>
                </Link>
                {/* Delete button — admin only, positioned top-right */}
                {isAdmin && (
                  <button
                    onClick={(e) => { e.preventDefault(); setDeleteEventTarget(event); }}
                    className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete event"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── External Event Assignments — for org members assigned in OTHER orgs ── */}
      {!isEventMember && externalAssignments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">External Assignments</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Events in other organisations where you have been assigned a role.
          </p>
          <div className="space-y-3">
            {externalAssignments.map((a) => (
              <div
                key={a.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-zinc-100">{a.event?.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      a.role === 'co_organizer'
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {a.role === 'co_organizer'
                        ? <><ShieldCheck className="w-3 h-3 inline mr-1" />Co-organizer</>
                        : <><ScanLine className="w-3 h-3 inline mr-1" />Scanner</>}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {a.org?.name}
                    {a.event?.date && ` · 📅 ${formatDateShort(a.event.date)}`}
                    {a.event?.location && ` · 📍 ${a.event.location}`}
                  </p>
                </div>
                {/* Deep-link directly to scan page for scanners, event page for co-organizers */}
                <Button size="sm" variant="secondary" asChild>
                  {a.role === 'scanner' ? (
                    <Link href={`/dashboard/events/${a.event?.id}/scan`}>
                      <ScanLine className="w-4 h-4" /> Open Scanner
                    </Link>
                  ) : (
                    <Link href={`/dashboard/events/${a.event?.id}`}>
                      <ArrowRight className="w-4 h-4" /> View event
                    </Link>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete event confirm dialog */}
      <ConfirmDialog
        open={!!deleteEventTarget}
        title="Delete Event"
        description={deleteEventTarget
          ? `Permanently delete "${deleteEventTarget.name}" and all its registrations? This cannot be undone.`
          : ''}
        confirmLabel="Delete Event"
        loading={deleteEventMutation.isPending}
        onConfirm={() => deleteEventTarget && deleteEventMutation.mutate(deleteEventTarget.id)}
        onCancel={() => setDeleteEventTarget(null)}
      />
    </div>
  );
}

