// apps/web/app/super-admin/orgs/page.tsx
// Super admin: list all organisations with status filter + approve/reject actions.

'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, XCircle, AlertCircle, ChevronRight, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Spinner } from '@/components/ui/spinner';
import { saApi } from '@/lib/saApi';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/utils';

type OrgStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface OrgSummary {
  id:               string;
  name:             string;
  email:            string;
  status:           OrgStatus;
  rejection_reason: string | null;
  created_at:       string;
  member_count:     number;
  event_count:      number;
}

const STATUS_FILTERS: { label: string; value: OrgStatus | 'all' }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Pending',   value: 'pending' },
  { label: 'Approved',  value: 'approved' },
  { label: 'Rejected',  value: 'rejected' },
  { label: 'Suspended', value: 'suspended' },
];

const statusBadge: Record<OrgStatus, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  approved:  { label: 'Approved',  cls: 'bg-green-500/10  text-green-400  border-green-500/20' },
  rejected:  { label: 'Rejected',  cls: 'bg-red-500/10    text-red-400    border-red-500/20' },
  suspended: { label: 'Suspended', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

function OrgsContent() {
  const qc           = useQueryClient();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<OrgStatus | 'all'>('all');
  const [rejectId, setRejectId]       = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Sync filter from URL query param (?status=pending, etc.)
  useEffect(() => {
    const s = searchParams.get('status');
    if (s && ['pending', 'approved', 'rejected', 'suspended'].includes(s)) {
      setFilter(s as OrgStatus);
    } else {
      setFilter('all');
    }
  }, [searchParams]);

  const { data: orgs = [], isLoading } = useQuery<OrgSummary[]>({
    queryKey: ['sa-orgs', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const { data } = await saApi.get(`/super-admin/orgs${params}`);
      return data;
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: OrgStatus; reason?: string }) =>
      saApi.patch(`/super-admin/orgs/${id}/status`, { status, rejectionReason: reason }),
    onSuccess: (_, vars) => {
      toast.success(`Organisation ${vars.status}`);
      qc.invalidateQueries({ queryKey: ['sa-orgs'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
      setRejectId(null);
      setRejectReason('');
    },
    onError: () => toast.error('Failed to update status'),
  });

  return (
    <div>
      <PageHeader title="Organisations" subtitle="Review, approve, and manage all organisations." />

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              filter === value
                ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-zinc-100 font-semibold mb-3">Reject organisation</h3>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-red-500/50"
              rows={3}
              placeholder="Reason for rejection (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-xl font-medium transition-colors disabled:opacity-50"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: rejectId, status: 'rejected', reason: rejectReason })}
              >
                {statusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reject'}
              </button>
              <button
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-xl font-medium transition-colors"
                onClick={() => { setRejectId(null); setRejectReason(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">No organisations found.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium">Organisation</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden md:table-cell">Members</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden lg:table-cell">Events</th>
                <th className="text-left px-4 py-3 text-xs text-zinc-500 uppercase tracking-wide font-medium hidden md:table-cell">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const badge = statusBadge[org.status];
                return (
                  <tr key={org.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-zinc-200 font-medium">{org.name}</p>
                      <p className="text-zinc-500 text-xs">{org.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{org.member_count}</td>
                    <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell">{org.event_count}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs hidden md:table-cell">
                      {formatDateShort(org.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {org.status === 'pending' && (
                          <>
                            <button
                              title="Approve"
                              className="text-zinc-500 hover:text-green-400 transition-colors"
                              onClick={() => statusMutation.mutate({ id: org.id, status: 'approved' })}
                              disabled={statusMutation.isPending}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              title="Reject"
                              className="text-zinc-500 hover:text-red-400 transition-colors"
                              onClick={() => setRejectId(org.id)}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {org.status === 'approved' && (
                          <button
                            title="Suspend"
                            className="text-zinc-500 hover:text-orange-400 transition-colors"
                            onClick={() => statusMutation.mutate({ id: org.id, status: 'suspended' })}
                            disabled={statusMutation.isPending}
                          >
                            <AlertCircle className="w-4 h-4" />
                          </button>
                        )}
                        {(org.status === 'rejected' || org.status === 'suspended') && (
                          <button
                            title="Re-approve"
                            className="text-zinc-500 hover:text-green-400 transition-colors"
                            onClick={() => statusMutation.mutate({ id: org.id, status: 'approved' })}
                            disabled={statusMutation.isPending}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          href={`/super-admin/orgs/${org.id}`}
                          className="text-zinc-500 hover:text-zinc-200 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminOrgsPage() {
  return (
    <Suspense>
      <OrgsContent />
    </Suspense>
  );
}
