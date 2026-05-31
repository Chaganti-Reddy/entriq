// apps/web/app/create-org/page.tsx
// Lets an existing participant create a new organisation (pending super-admin approval).
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Gem, Building2, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { AuthResponse } from '@entriq/shared';

const schema = z.object({
  orgName:      z.string().min(2, 'Organisation name must be at least 2 characters').max(100).trim(),
  contactEmail: z.string().email('Enter a valid email address').optional().or(z.literal('')),
});
type FormData = z.infer<typeof schema>;

export default function CreateOrgPage() {
  const router = useRouter();
  const { user, isAuthenticated, setAuth, _hasHydrated } = useAuthStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) router.replace('/login?redirect=/create-org');
  }, [_hasHydrated, isAuthenticated, router]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { contactEmail: user?.email ?? '' },
  });

  if (!_hasHydrated || !isAuthenticated || !user) return null;

  // Already in an org — redirect
  if (user.role) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <Building2 className="w-10 h-10 text-violet-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Already in an organisation</h2>
          <p className="text-zinc-400 text-sm mb-6">You&apos;re already part of <strong className="text-zinc-200">{user.orgName}</strong>. You can&apos;t create another organisation while belonging to one.</p>
          <Button className="w-full" asChild><Link href="/dashboard">Go to Dashboard</Link></Button>
        </div>
      </div>
    );
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const { data: res } = await api.post<AuthResponse>('/user/create-org', {
        orgName:      data.orgName,
        contactEmail: data.contactEmail,
      });
      setAuth(res.token, res.refreshToken, res.user);
      toast.success('Organisation created! Awaiting platform approval.');
      router.push('/pending-approval');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create organisation';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Gem className="w-5 h-5 text-violet-500" />
          <span className="font-semibold text-zinc-400 text-sm">Entriq</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/40 animate-slide-up">
          <Link
            href="/my-events"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
          >
            <ArrowLeft className="w-3 h-3" /> Back to My Events
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Building2 className="w-5 h-5 text-violet-400" />
            </div>
            <h1 className="text-xl font-bold text-zinc-100">Create an Organisation</h1>
          </div>
          <p className="text-sm text-zinc-400 mb-6 ml-[52px]">
            Your organisation will be reviewed and approved by the platform admin before you can create events.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="orgName">Organisation name *</Label>
              <Input
                id="orgName"
                className="mt-1.5"
                placeholder="Tech Fest Hyderabad"
                error={!!errors.orgName}
                {...register('orgName')}
              />
              {errors.orgName && <p className="text-xs text-red-400 mt-1">{errors.orgName.message}</p>}
            </div>

            <div>
              <Label htmlFor="contactEmail">
                Contact email
                <span className="text-zinc-600 font-normal ml-1">(optional, public-facing org email)</span>
              </Label>
              <Input
                id="contactEmail"
                type="email"
                className="mt-1.5"
                placeholder="hello@yourorg.com"
                error={!!errors.contactEmail}
                autoComplete="email"
                {...register('contactEmail')}
              />
              {errors.contactEmail && <p className="text-xs text-red-400 mt-1">{errors.contactEmail.message}</p>}
              <p className="text-xs text-zinc-500 mt-1">Optional — for communications and public-facing contact info.</p>
            </div>

            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
              <p className="text-xs text-yellow-300 leading-relaxed">
                ⚠️ After submission your organisation goes into <strong>pending approval</strong> state. The platform admin will review and approve it. You&apos;ll be able to log in and start managing events once approved.
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full mt-2" disabled={loading}>
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                : 'Create Organisation →'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
