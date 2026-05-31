// apps/web/app/dashboard/events/new/page.tsx
// Create event form with slug auto-generation and availability check.
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Check, X, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PageHeader } from '@/components/dashboard/page-header';
import { api } from '@/lib/api';
import { slugify } from '@/lib/utils';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.object({
  name: z.string().min(2, 'Event name is required').max(200),
  description: z.string().max(2000).optional(),
  date: z.string().min(1, 'Event date is required'),
  location: z.string().min(1, 'Location is required').max(300),
  venue: z.string().max(300).optional(),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(100)
    .regex(slugRegex, 'Slug must be lowercase with hyphens only (e.g. my-event)'),
  adminPassword: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

type FormData = z.infer<typeof schema>;

// ── Nominatim location search ──────────────────────────────────────────────────

interface NominatimResult { display_name: string }

function LocationSearch({
  value, onChange, error, placeholder,
}: {
  value: string; onChange: (v: string) => void; error?: boolean; placeholder?: string;
}) {
  const [query, setQuery]     = useState(value);
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef<ReturnType<typeof setTimeout>>();
  const containerRef          = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function search(q: string) {
    setQuery(q);
    onChange(q); // allow free-type too
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=0`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data: NominatimResult[] = await res.json();
        setResults(data.map((r) => r.display_name));
        setOpen(true);
      } catch { /* silent */ } finally { setLoading(false); }
    }, 600);
  }

  function pick(name: string) {
    setQuery(name); onChange(name); setOpen(false); setResults([]);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? 'Search city, area, district…'}
          error={error}
          className="pl-9 pr-8"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => pick(r)}
              className="w-full text-left px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800/50 last:border-0 truncate"
            >
              <MapPin className="inline w-3 h-3 mr-1.5 text-violet-400 shrink-0" />
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const nameValue     = watch('name', '');
  const slugValue     = watch('slug', '');
  const locationValue = watch('location', '');

  // Auto-generate slug from name
  useEffect(() => {
    if (nameValue) setValue('slug', slugify(nameValue), { shouldValidate: false });
  }, [nameValue, setValue]);

  // Debounced slug availability check
  const checkSlug = (slug: string) => {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    if (!slug || !slugRegex.test(slug)) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    slugTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/events/slug-check/${slug}`);
        setSlugStatus(data.available ? 'available' : 'taken');
      } catch { setSlugStatus('idle'); }
    }, 400);
  };

  useEffect(() => { checkSlug(slugValue); /* eslint-disable-next-line */ }, [slugValue]);

  async function onSubmit(data: FormData) {
    if (slugStatus === 'taken') { toast.error('This URL slug is already taken. Please choose another.'); return; }
    setLoading(true);
    try {
      const { data: event } = await api.post('/events', {
        name: data.name,
        description: data.description || undefined,
        date: data.date,
        location: data.location,
        venue: data.venue || undefined,
        slug: data.slug,
        adminPassword: data.adminPassword,
      });
      toast.success('Event created! Share your form link.');
      router.push(`/dashboard/events/${event.id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create event';
      toast.error(msg);
    } finally { setLoading(false); }
  }

  return (
    <div>
      <PageHeader
        title="Create Event"
        subtitle="Fill in the details to set up your event"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard"><ArrowLeft className="w-4 h-4" /> Back</Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">

          {/* Event name */}
          <div>
            <Label htmlFor="name">Event name *</Label>
            <Input id="name" className="mt-1.5" placeholder="Annual Tech Summit 2025" error={!!errors.name} {...register('name')} />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" className="mt-1.5" placeholder="Brief description of your event…" rows={3} {...register('description')} />
          </div>

          {/* Date + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Event date *</Label>
              <Input id="date" type="date" className="mt-1.5" error={!!errors.date} {...register('date')} />
              {errors.date && <p className="text-xs text-red-400 mt-1">{errors.date.message}</p>}
            </div>
            <div>
              <Label htmlFor="location">City / Location *</Label>
              <div className="mt-1.5">
                <LocationSearch
                  value={locationValue}
                  onChange={(v) => setValue('location', v, { shouldValidate: true })}
                  error={!!errors.location}
                  placeholder="Search city or area…"
                />
              </div>
              {errors.location && <p className="text-xs text-red-400 mt-1">{errors.location.message}</p>}
            </div>
          </div>

          {/* Venue */}
          <div>
            <Label htmlFor="venue">
              Venue / Hall name
              <span className="ml-1 text-zinc-500 font-normal text-xs">(specific building or convention centre)</span>
            </Label>
            <Input id="venue" className="mt-1.5" placeholder="e.g. Hyderabad International Convention Centre" {...register('venue')} />
          </div>

          {/* Slug */}
          <div>
            <Label htmlFor="slug">Registration URL slug *</Label>
            <div className="relative mt-1.5">
              <div className="flex items-center rounded-xl border border-zinc-700 overflow-hidden focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                <span className="px-3 py-2 text-sm text-zinc-500 bg-zinc-950 border-r border-zinc-700 shrink-0 select-none">
                  entriq.app/e/
                </span>
                <input
                  id="slug"
                  className="flex-1 h-10 px-3 bg-zinc-900 text-sm text-zinc-100 outline-none"
                  placeholder="my-event-2025"
                  {...register('slug')}
                />
                <div className="pr-3">
                  {slugStatus === 'checking' && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />}
                  {slugStatus === 'available' && <Check className="w-4 h-4 text-green-400" />}
                  {slugStatus === 'taken' && <X className="w-4 h-4 text-red-400" />}
                </div>
              </div>
            </div>
            {slugStatus === 'available' && <p className="text-xs text-green-400 mt-1">✓ URL is available</p>}
            {slugStatus === 'taken' && <p className="text-xs text-red-400 mt-1">✗ This slug is already taken</p>}
            {errors.slug && <p className="text-xs text-red-400 mt-1">{errors.slug.message}</p>}
          </div>

          {/* Admin password */}
          <div>
            <Label htmlFor="adminPassword">Gate password *</Label>
            <PasswordInput id="adminPassword" className="mt-1.5" placeholder="Min 6 characters" error={!!errors.adminPassword} {...register('adminPassword')} />
            {errors.adminPassword && <p className="text-xs text-red-400 mt-1">{errors.adminPassword.message}</p>}
            <div className="flex gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl mt-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">Keep this password safe. Share it only with your entry gate staff.</p>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating event…</> : 'Create Event →'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
