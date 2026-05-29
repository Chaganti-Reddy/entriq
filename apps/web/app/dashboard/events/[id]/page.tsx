// apps/web/app/dashboard/events/[id]/page.tsx
// Event detail: stats, copy link, live registrations table, CSV export, approval workflow.
'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Users, CheckCircle2, Clock, BarChart3,
  Link2, ExternalLink, Search, Download, RefreshCw, ScanLine, Users2,
  UserCheck, CheckCheck, Square, CheckSquare, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { PageHeader } from '@/components/dashboard/page-header';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { formatDateShort, formatDateTime, timeAgo } from '@/lib/utils';
import type { EventWithCounts, Registration } from '@entriq/shared';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_approved' | 'admin_approved' | 'approved'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget]         = useState<Registration | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin       = user?.role === 'admin';
  const isEventMember = (user as any)?.isEventMember === true;

  const { data: event, isLoading: eventLoading } = useQuery<EventWithCounts>({
    queryKey: ['event', id],
    queryFn: async () => {
      const { data } = await api.get(`/events/${id}`);
      return data;
    },
  });

  const { data: registrations, isLoading: regsLoading, refetch } = useQuery<Registration[]>({
    queryKey: ['registrations', id],
    queryFn: async () => {
      const { data } = await api.get(`/registrations/event/${id}`);
      setLastUpdated(new Date());
      return data;
    },
    refetchInterval: 30_000,
  });

  // ── Approval mutations ──────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 1) {
        return api.patch(`/registrations/${ids[0]}/approve`);
      }
      return api.post('/registrations/bulk-approve', { ids });
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['registrations', id] });
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      toast.success(ids.length === 1 ? 'Registration approved!' : `${ids.length} registrations approved!`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error('Failed to approve. Please try again.'),
  });

  const handleApprove = useCallback((ids: string[]) => {
    approveMutation.mutate(ids);
  }, [approveMutation]);

  const deleteMutation = useMutation({
    mutationFn: (regId: string) => api.delete(`/registrations/${regId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrations', id] });
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      toast.success('Registration deleted.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete. Please try again.'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/registrations/bulk-delete', { ids }),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['registrations', id] });
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      toast.success(`${ids.length} registration${ids.length !== 1 ? 's' : ''} deleted.`);
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    },
    onError: () => toast.error('Failed to delete. Please try again.'),
  });

  const toggleSelect = useCallback((regId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(regId) ? next.delete(regId) : next.add(regId);
      return next;
    });
  }, []);

  const pendingRegs = registrations?.filter((r) => r.status === 'not_approved') ?? [];

  const formLink = event ? `${APP_URL}/e/${event.slug}` : '';

  const filtered = registrations?.filter((r) => {
    if (statusFilter === 'not_approved'  && r.status !== 'not_approved')  return false;
    if (statusFilter === 'admin_approved' && r.status !== 'admin_approved') return false;
    if (statusFilter === 'approved'       && r.status !== 'approved')       return false;
    const q = search.toLowerCase();
    return !q || (
      r.name.toLowerCase().includes(q) ||
      r.surname.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q)
    );
  });

  const toggleSelectAll = useCallback(() => {
    const visible = (filtered ?? []);
    if (visible.every((r) => selectedIds.has(r.id)) && visible.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((r) => r.id)));
    }
  }, [filtered, selectedIds]);

  function exportCSV() {
    if (!registrations?.length) return;

    const csvField = (v: string | null | undefined): string => {
      const s = String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const headers = ['Name', 'Surname', 'Email', 'City', 'State', 'Mobile', 'Profession', 'Status', 'Registered At'];
    const rows = registrations.map((r) => [
      csvField(r.name), csvField(r.surname), csvField(r.email),
      csvField(r.city), csvField(r.state), csvField(r.mobile),
      csvField(r.profession), csvField(r.status),
      csvField(new Date(r.registered_at).toLocaleString()),
    ]);
    const csv = [headers.map(csvField), ...rows].map((row) => row.join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event?.slug ?? 'registrations'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const checkinRate = event
    ? Math.round(((event.checkin_count) / Math.max(event.registration_count, 1)) * 100)
    : 0;

  const isScanner = event?.userEventRole === 'scanner';

  const pendingCount       = registrations?.filter((r) => r.status === 'not_approved').length ?? 0;
  const adminApprovedCount = registrations?.filter((r) => r.status === 'admin_approved').length ?? 0;
  const checkedInCount     = registrations?.filter((r) => r.status === 'approved').length ?? 0;
  const selectedPendingIds = [...selectedIds].filter(
    (sid) => registrations?.find((r) => r.id === sid)?.status === 'not_approved'
  );

  if (eventLoading) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-32">
        <p className="text-zinc-400">Event not found.</p>
        <Button variant="ghost" asChild className="mt-4">
          <Link href="/dashboard"><ArrowLeft className="w-4 h-4" /> Back to events</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={event.name}
        subtitle={[formatDateShort(event.date), event.location].filter(Boolean).join(' · ')}
        badge={<StatusBadge status={event.is_active ? 'active' : 'inactive'} />}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard"><ArrowLeft className="w-4 h-4" /> Events</Link>
            </Button>
            {isAdmin && (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/dashboard/events/${id}/edit`}>Edit event</Link>
              </Button>
            )}
            {isAdmin && (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/dashboard/events/${id}/team`}>
                  <Users2 className="w-4 h-4" /> Team
                </Link>
              </Button>
            )}
            <Button size="sm" asChild className="bg-violet-600 hover:bg-violet-500 text-white">
              <Link href={`/dashboard/events/${id}/scan`}>
                <ScanLine className="w-4 h-4" /> Start Scanner
              </Link>
            </Button>
          </div>
        }
      />

      {/* Stats */}
      {!isScanner && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Registered"  value={event.registration_count} icon={Users}          accentColor="default" />
        <StatCard label="Checked in"  value={event.checkin_count}      icon={CheckCircle2}   accentColor="green"  />
        <StatCard label="Pending"     value={event.registration_count - event.checkin_count} icon={Clock} accentColor="yellow" />
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-violet-400" />
              </div>
            </div>
            <span className="text-2xl font-bold text-zinc-100 tabular-nums">{checkinRate}%</span>
          </div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Check-in rate</p>
          <Progress value={checkinRate} />
        </div>
      </div>
      )}

      {/* Scanner-only view */}
      {isScanner && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ScanLine className="w-9 h-9 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 mb-1">Ready to scan</h2>
            <p className="text-sm text-zinc-500">You're assigned as a scanner for <span className="text-zinc-300 font-medium">{event.name}</span>.</p>
          </div>
          <Button size="lg" asChild className="bg-violet-600 hover:bg-violet-500 text-white">
            <Link href={`/dashboard/events/${id}/scan`}>
              <ScanLine className="w-5 h-5" /> Open Scanner
            </Link>
          </Button>
        </div>
      )}

      {/* Registration link */}
      {!isScanner && (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Registration link</p>
        <div className="flex items-center gap-3 p-3 bg-zinc-950 rounded-xl border border-zinc-800">
          <Link2 className="w-4 h-4 text-violet-400 shrink-0" />
          <code className="flex-1 text-sm text-zinc-300 truncate">{formLink}</code>
          <CopyButton value={formLink} />
          <Button size="sm" variant="ghost" asChild>
            <a href={formLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>
      )}

      {/* Registrations table */}
      {!isScanner && (
      <div>
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-zinc-100">
              Registrations
              {registrations && (
                <span className="ml-2 text-sm font-normal text-zinc-500">({registrations.length})</span>
              )}
            </h2>
            {/* Status filter pills */}
            {registrations && registrations.length > 0 && (
              <div className="flex items-center gap-1">
                {(['all', 'not_approved', 'admin_approved', 'approved'] as const).map((f) => {
                  const label =
                    f === 'all'           ? `All (${registrations.length})` :
                    f === 'not_approved'  ? `Pending (${pendingCount})` :
                    f === 'admin_approved'? `Approved (${adminApprovedCount})` :
                                           `Checked In (${checkedInCount})`;
                  return (
                    <button
                      key={f}
                      onClick={() => { setStatusFilter(f); setSelectedIds(new Set()); }}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        statusFilter === f
                          ? f === 'not_approved'  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                            : f === 'admin_approved' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : f === 'approved' ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk approve button — only for selected pending rows */}
            {selectedPendingIds.length > 0 && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-500 text-white"
                onClick={() => handleApprove(selectedPendingIds)}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4" />
                )}
                Approve {selectedPendingIds.length} selected
              </Button>
            )}
            {/* Bulk delete button — for any selected rows */}
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-500 text-white"
                onClick={() => setBulkDeleteConfirm(true)}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete {selectedIds.size} selected
              </Button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-56 h-9 text-xs"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Pending approval notice */}
        {pendingCount > 0 && statusFilter !== 'admin_approved' && statusFilter !== 'approved' && (
          <div className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4">
            <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-xs text-yellow-300">
              <span className="font-semibold">{pendingCount} registration{pendingCount !== 1 ? 's' : ''}</span> awaiting your approval.
              Registrants will only see their QR pass after you approve.
            </p>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {/* Select all pending (across all pages/filters) */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                onClick={() => {
                  const allPendingSelected = pendingRegs.every((r) => selectedIds.has(r.id)) && pendingRegs.length > 0;
                  if (allPendingSelected) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      pendingRegs.forEach((r) => next.delete(r.id));
                      return next;
                    });
                  } else {
                    setSelectedIds((prev) => new Set([...prev, ...pendingRegs.map((r) => r.id)]));
                  }
                }}
              >
                {pendingRegs.every((r) => selectedIds.has(r.id)) && pendingRegs.length > 0
                  ? <><Square className="w-3 h-3" /> Deselect pending</>
                  : <><CheckSquare className="w-3 h-3" /> Select all pending</>}
              </Button>
            </div>
          </div>
        )}

        {regsLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : !filtered?.length ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
            <p className="text-zinc-500 text-sm">
              {search ? 'No registrations match your search.' : statusFilter !== 'all' ? `No ${statusFilter === 'not_approved' ? 'pending' : statusFilter === 'admin_approved' ? 'approved' : 'checked-in'} registrations.` : 'No registrations yet.'}
            </p>
            {!search && statusFilter === 'all' && (
              <p className="text-zinc-600 text-xs mt-1">
                Share the registration link above to start collecting sign-ups.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((reg) => {
              const isPending  = reg.status === 'not_approved';
              const isSelected = selectedIds.has(reg.id);
              const isApproving = approveMutation.isPending && approveMutation.variables?.includes(reg.id);

              return (
                <div
                  key={reg.id}
                  className={`bg-zinc-900 border rounded-xl p-4 transition-colors ${
                    isSelected
                      ? 'border-violet-500/50 bg-violet-500/5'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox — all rows */}
                    <button
                      onClick={() => toggleSelect(reg.id)}
                      className="mt-0.5 shrink-0 text-zinc-500 hover:text-violet-400 transition-colors"
                      aria-label={isSelected ? 'Deselect' : 'Select'}
                    >
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-violet-400" />
                        : <Square className="w-4 h-4" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-medium text-zinc-100 text-sm">
                          {reg.name} {reg.surname}
                        </span>
                        <StatusBadge status={reg.status} />
                      </div>
                      <p className="text-xs text-zinc-500 mb-1">{reg.email}</p>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                        <span>{reg.city}, {reg.state}</span>
                        <span>·</span>
                        <span>{reg.profession}</span>
                        {reg.mobile && <><span>·</span><span>{reg.mobile}</span></>}
                      </div>
                    </div>

                    {/* Right side: time + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-zinc-500">{formatDateTime(reg.registered_at)}</p>
                        <code className="text-[10px] text-zinc-600 font-mono">{reg.unique_code}</code>
                      </div>
                      {isPending && (
                        <Button
                          size="sm"
                          className="h-8 bg-green-600 hover:bg-green-500 text-white text-xs"
                          onClick={() => handleApprove([reg.id])}
                          disabled={approveMutation.isPending}
                        >
                          {isApproving ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserCheck className="w-3 h-3" />
                          )}
                          Approve
                        </Button>
                      )}
                      {!isPending && (
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        </div>
                      )}
                      <button
                        onClick={() => setDeleteTarget(reg)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete registration"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {registrations && (
          <p className="text-xs text-zinc-600 mt-3 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Last updated {timeAgo(lastUpdated.toISOString())} · Auto-refreshes every 30s
          </p>
        )}
      </div>
      )}

      {/* Delete registration confirm dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Registration"
        description={deleteTarget
          ? `Remove ${deleteTarget.name} ${deleteTarget.surname}'s registration? This cannot be undone.`
          : ''}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Bulk delete confirm dialog */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title={`Delete ${selectedIds.size} Registration${selectedIds.size !== 1 ? 's' : ''}`}
        description={`Permanently remove ${selectedIds.size} selected registration${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel={`Delete ${selectedIds.size} selected`}
        loading={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate([...selectedIds])}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
}
