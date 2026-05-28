// apps/web/app/dashboard/events/[id]/edit/page.tsx
// Edit existing event — slug change triggers uniqueness check, admin password optional.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/dashboard/page-header';
import { api } from '@/lib/api';
import type { Event } from '@entriq/shared';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.object({
  name: z.string().min(2, 'Name is required').max(200),
  description: z.string().max(2000).optional(),
  date: z.string().optional(),
  location: z.string().max(300).optional(),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(100)
    .regex(slugRegex, 'Slug must be lowercase with hyphens only'),
  adminPassword: z.string().max(100).optional(),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'same'>('idle');
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalSlugRef = useRef<string>('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const slugValue = watch('slug', '');

  // Load existing event data
  useEffect(() => {
    api.get<Event>(`/events/${id}`)
      .then(({ data }) => {
        originalSlugRef.current = data.slug;
        reset({
          name: data.name,
          description: data.description ?? '',
          date: data.date ?? '',
          location: data.location ?? '',
          slug: data.slug,
          adminPassword: '',
          isActive: data.is_active,
        });
      })
      .catch(() => toast.error('Failed to load event'))
      .finally(() => setFetching(false));
  }, [id, reset]);

  // Debounced slug availability check (skip if unchanged from original)
  const checkSlug = (slug: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);

    if (slug === originalSlugRef.current) {
      setSlugStatus('same');
      return;
    }
    if (!slug || !slugRegex.test(slug)) {
      setSlugStatus('idle');
      return;
    }

    setSlugStatus('checking');
    slugTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/events/slug-check/${slug}`);
        setSlugStatus(data.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
  };

  useEffect(() => {
    checkSlug(slugValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugValue]);

  async function onSubmit(values: FormData) {
    if (slugStatus === 'taken') {
      toast.error('Slug is already taken — choose a different one');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        description: values.description || undefined,
        date: values.date || undefined,
        location: values.location || undefined,
        slug: values.slug,
        isActive: values.isActive,
      };
      if (values.adminPassword) {
        payload.adminPassword = values.adminPassword;
      }

      await api.put(`/events/${id}`, payload);
      toast.success('Event updated');
      router.push(`/dashboard/events/${id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Failed to update event');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Edit Event"
        subtitle="Update event details"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/events/${id}`}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-5">
        {/* Name */}
        <div>
          <Label htmlFor="name">Event name *</Label>
          <Input id="name" className="mt-1.5" error={!!errors.name} {...register('name')} />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" className="mt-1.5 h-24 resize-none" {...register('description')} />
        </div>

        {/* Date + Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" className="mt-1.5" {...register('date')} />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" className="mt-1.5" placeholder="City or venue" {...register('location')} />
          </div>
        </div>

        {/* Slug */}
        <div>
          <Label htmlFor="slug">URL slug *</Label>
          <div className="relative mt-1.5">
            <Input
              id="slug"
              error={!!errors.slug || slugStatus === 'taken'}
              {...register('slug')}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {slugStatus === 'checking' && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
              {(slugStatus === 'available' || slugStatus === 'same') && <Check className="w-4 h-4 text-emerald-400" />}
              {slugStatus === 'taken' && <X className="w-4 h-4 text-red-400" />}
            </span>
          </div>
          {errors.slug && <p className="text-xs text-red-400 mt-1">{errors.slug.message}</p>}
          {slugStatus === 'taken' && !errors.slug && (
            <p className="text-xs text-red-400 mt-1">This slug is already taken</p>
          )}
        </div>

        {/* Admin Password */}
        <div>
          <Label htmlFor="adminPassword">New gate password</Label>
          <PasswordInput
            id="adminPassword"
            className="mt-1.5"
            placeholder="Leave blank to keep existing"
            {...register('adminPassword')}
          />
          <p className="text-xs text-zinc-500 mt-1">Only fill this in if you want to change the scan password</p>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3 py-1">
          <input
            id="isActive"
            type="checkbox"
            className="w-4 h-4 rounded accent-violet-500"
            {...register('isActive')}
          />
          <Label htmlFor="isActive" className="cursor-pointer">Event is active (accepting registrations)</Label>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading || slugStatus === 'taken'} className="min-w-[120px]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/dashboard/events/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
