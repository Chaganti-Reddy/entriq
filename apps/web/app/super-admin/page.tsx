// apps/web/app/super-admin/page.tsx
// Super admin overview — platform stats, clickable cards.

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, Clock, CalendarDays, Users } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { PageHeader } from '@/components/dashboard/page-header';
import { Spinner } from '@/components/ui/spinner';
import { saApi } from '@/lib/saApi';

interface Stats {
  totalOrgs:          number;
  pendingOrgs:        number;
  approvedOrgs:       number;
  totalEvents:        number;
  totalRegistrations: number;
}

export default function SuperAdminOverviewPage() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['sa-stats'],
    queryFn: async () => {
      const { data } = await saApi.get('/super-admin/stats');
      return data;
    },
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader title="Platform Overview" subtitle="Real-time stats across all organisations." />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link href="/super-admin/orgs" className="block rounded-2xl hover:scale-[1.02] transition-transform">
            <StatCard label="Total orgs"       value={stats?.totalOrgs ?? 0}          icon={Building2}    accentColor="violet" />
          </Link>
          <Link href="/super-admin/orgs?status=pending" className="block rounded-2xl hover:scale-[1.02] transition-transform">
            <StatCard label="Pending approval" value={stats?.pendingOrgs ?? 0}        icon={Clock}        accentColor="yellow" />
          </Link>
          <Link href="/super-admin/orgs?status=approved" className="block rounded-2xl hover:scale-[1.02] transition-transform">
            <StatCard label="Approved orgs"    value={stats?.approvedOrgs ?? 0}       icon={CheckCircle2} accentColor="green" />
          </Link>
          <Link href="/super-admin/orgs" className="block rounded-2xl hover:scale-[1.02] transition-transform">
            <StatCard label="Total events"     value={stats?.totalEvents ?? 0}        icon={CalendarDays} />
          </Link>
          <Link href="/super-admin/orgs" className="block rounded-2xl hover:scale-[1.02] transition-transform">
            <StatCard label="Registrations"    value={stats?.totalRegistrations ?? 0} icon={Users} />
          </Link>
        </div>
      )}
    </div>
  );
}
