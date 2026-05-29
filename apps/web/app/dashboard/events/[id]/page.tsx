// apps/web/app/dashboard/events/[id]/page.tsx
// Event detail: stats, copy link, live registrations table, CSV export.
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Users, CheckCircle2, Clock, BarChart3,
  Link2, ExternalLink, Search, Download, RefreshCw, ScanLine
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { PageHeader } from '@/components/dashboard/page-header';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { formatDateShort, formatDateTime, timeAgo } from '@/lib/utils';
import type { EventWithCounts, Registration } from '@entriq/shared';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

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

  const formLink = event ? `${APP_URL}/e/${event.slug}` : '';

  const filtered = registrations?.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.surname.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q)
    );
  });

  function exportCSV() {
    if (!registrations?.length) return;

    // Escape a single CSV field: wrap in quotes, double any internal quotes.
    // Also strips leading =+-@ to prevent CSV formula injection attacks.
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
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
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
            <Button size="sm" asChild className="bg-violet-600 hover:bg-violet-500 text-white">
              <Link href={`/dashboard/events/${id}/scan`}>
                <ScanLine className="w-4 h-4" /> Start Scanner
              </Link>
            </Button>
          </div>
        }
      />

      {/* Stats */}
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

      {/* Registration link */}
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

      {/* Registrations table */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-zinc-100">
            Registrations
            {registrations && (
              <span className="ml-2 text-sm font-normal text-zinc-500">({registrations.length})</span>
            )}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
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

        {regsLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : !filtered?.length ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
            <p className="text-zinc-500 text-sm">
              {search ? 'No registrations match your search.' : 'No registrations yet.'}
            </p>
            {!search && (
              <p className="text-zinc-600 text-xs mt-1">
                Share the registration link above to start collecting sign-ups.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((reg) => (
              <div
                key={reg.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-zinc-100 text-sm">
                        {reg.name} {reg.surname}
                      </span>
                      <StatusBadge status={reg.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                      <span>{reg.email}</span>
                      <span>·</span>
                      <span>{reg.city}, {reg.state}</span>
                      <span>·</span>
                      <span>{reg.profession}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500">{formatDateTime(reg.registered_at)}</p>
                    <code className="text-[10px] text-zinc-600 font-mono">{reg.unique_code}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {registrations && (
          <p className="text-xs text-zinc-600 mt-3 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Last updated {timeAgo(lastUpdated.toISOString())} · Auto-refreshes every 30s
          </p>
        )}
      </div>
    </div>
  );
}
