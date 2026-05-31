// apps/web/app/super-admin/users/page.tsx
// Super admin: view and manage all registered user accounts.

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Phone, Mail, Trash2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/dashboard/page-header';
import { saApi } from '@/lib/saApi';
import { toast } from 'sonner';
import { formatDateShort } from '@/lib/utils';

interface UserAccount {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  mobile_verified: boolean;
  created_at: string;
}

interface UsersResponse {
  users: UserAccount[];
  total: number;
  page: number;
  limit: number;
}

export default function SuperAdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<UsersResponse>({
    queryKey: ['sa-users', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search.trim()) params.set('search', search.trim());
      const { data } = await saApi.get(`/super-admin/users?${params}`);
      return data;
    },
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => saApi.delete(`/super-admin/users/${userId}`),
    onSuccess: () => {
      toast.success('User account deleted.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['sa-users'] });
      qc.invalidateQueries({ queryKey: ['sa-stats'] });
    },
    onError: () => toast.error('Failed to delete user.'),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div>
      <PageHeader title="User Accounts" subtitle="All registered users on the platform." />

      {/* Search + refresh */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search by name, mobile or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
        {data && (
          <span className="text-sm text-zinc-500">{data.total.toLocaleString()} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data?.users.length ? (
        <div className="py-16 text-center text-zinc-500">No users found.</div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-4">
            {data.users.map((u, i) => (
              <div
                key={u.id}
                className={`flex items-center gap-4 px-5 py-4 ${i !== data.users.length - 1 ? 'border-b border-zinc-800/60' : ''}`}
              >
                {/* Avatar initial */}
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-violet-400">{(u.name ?? '?')[0].toUpperCase()}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-200">{u.name ?? '—'}</span>
                    {u.mobile_verified ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700/40 text-zinc-500 border border-zinc-700">
                        <XCircle className="w-2.5 h-2.5" /> Unverified
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-0.5">
                    {u.mobile && (
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" />+91 {u.mobile}
                      </span>
                    )}
                    {u.email && (
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />{u.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Joined date */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-zinc-600">Joined</p>
                  <p className="text-xs text-zinc-400">{formatDateShort(u.created_at)}</p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => setDeleteTarget(u)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  title="Delete user"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <span className="text-sm text-zinc-500">Page {page} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User Account"
        description={deleteTarget
          ? `Permanently delete ${deleteTarget.name}'s account (+91 ${deleteTarget.mobile ?? deleteTarget.email})? This removes all their registrations and team memberships. Cannot be undone.`
          : ''}
        confirmLabel="Delete Account"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
