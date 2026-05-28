// apps/web/app/dashboard/page.tsx
// Dashboard home: stats + events list
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Users, CheckCircle2, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PageHeader } from '@/components/dashboard/page-header';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { formatDateShort } from '@/lib/utils';
import type { EventWithCounts } from '@entriq/shared';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const { data: events, isLoading } = useQuery<EventWithCounts[]>({
    queryKey: ['events'],
    queryFn: async () => {
      const { data } = await api.get('/events');
      return data;
    },
    refetchInterval: 30_000,
  });

  const totalRegistrations = events?.reduce((s, e) => s + e.registration_count, 0) ?? 0;
  const totalCheckins = events?.reduce((s, e) => s + e.checkin_count, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.orgName ?? '…'} 👋`}
        subtitle="Here's what's happening across your events."
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Events"
          value={events?.length ?? 0}
          icon={CalendarDays}
          accentColor="violet"
        />
        <StatCard
          label="Total registered"
          value={totalRegistrations}
          icon={Users}
          accentColor="default"
        />
        <StatCard
          label="Total checked in"
          value={totalCheckins}
          icon={CheckCircle2}
          accentColor="green"
          sub={totalRegistrations > 0 ? `${Math.round((totalCheckins / totalRegistrations) * 100)}% check-in rate` : undefined}
        />
      </div>

      {/* Events list */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Your Events</h2>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : !events?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="No events yet"
            description={
              isAdmin
                ? 'Create your first event to start collecting registrations and managing check-ins.'
                : 'No events have been created yet. Ask your admin to create one.'
            }
            action={
              isAdmin ? (
                <Button asChild>
                  <Link href="/dashboard/events/new">Create event →</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/dashboard/events/${event.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-zinc-100">{event.name}</span>
                      <StatusBadge status={event.is_active ? 'active' : 'inactive'} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                      {event.date && <span>📅 {formatDateShort(event.date)}</span>}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
