// apps/web/app/e/[slug]/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Gem, Calendar, MapPin, Loader2, LogIn, CheckCircle2, ChevronDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ─── Indian states & UTs ──────────────────────────────────────────────────────
const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  name:       z.string().min(1, 'Required').max(100).trim(),
  surname:    z.string().min(1, 'Required').max(100).trim(),
  state:      z.string().min(1, 'Select a state'),
  city:       z.string().min(1, 'Select a city'),
  mobile:     z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number'),
  profession: z.string().min(1, 'Required').max(100).trim(),
  otherInfo:  z.string().max(500).optional(),
});
type FormData = z.infer<typeof schema>;

interface EventPublic {
  id: string; name: string; date: string | null; location: string | null; is_active: boolean;
}

interface Leader { id: string; name: string; }

// ─── Searchable leader dropdown ───────────────────────────────────────────────
function LeaderSelect({
  leaders, value, onChange, error,
}: { leaders: Leader[]; value: string; onChange: (id: string) => void; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = leaders.find((l) => l.id === value);
  const filtered = leaders.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-2 bg-zinc-900 border rounded-xl px-3 py-2.5 text-sm text-left',
          'focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors',
          error ? 'border-red-500/50' : 'border-zinc-700 hover:border-zinc-600',
        )}
      >
        {selected ? (
          <>
            <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs text-violet-400 font-medium">{selected.name.charAt(0)}</span>
            </div>
            <span className="text-zinc-100">{selected.name}</span>
          </>
        ) : (
          <span className="text-zinc-500">Search and select a leader…</span>
        )}
        <ChevronDown className={cn('ml-auto w-4 h-4 text-zinc-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
          <div className="p-2 border-b border-zinc-800">
            <input
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-violet-500"
              placeholder="Type to search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-zinc-500 px-3 py-4 text-center">No leaders found</p>
            ) : (
              filtered.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2.5 transition-colors"
                  onClick={() => { onChange(l.id); setOpen(false); setSearch(''); }}
                >
                  <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs text-violet-400 font-medium">{l.name.charAt(0)}</span>
                  </div>
                  <span>{l.name}</span>
                  {l.id === value && <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 ml-auto" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Select component ─────────────────────────────────────────────────────────
function Select({
  id, value, onChange, options, placeholder, disabled, error,
}: {
  id: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; disabled?: boolean; error?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full appearance-none bg-zinc-900 border rounded-xl px-3 py-2.5 pr-9 text-sm text-zinc-100',
          'focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error ? 'border-red-500/50' : 'border-zinc-700 hover:border-zinc-600',
        )}
      >
        <option value="" disabled className="text-zinc-500">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-zinc-900">{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RegistrationFormPage() {
  const { slug }   = useParams<{ slug: string }>();
  const router     = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [submitting, setSubmitting]             = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [selectedState, setSelectedState]       = useState('');
  const [cities, setCities]                     = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading]       = useState(false);
  const [referredById, setReferredById]         = useState('');
  const [referredByError, setReferredByError]   = useState(false);

  const { data: event, isLoading, error } = useQuery<EventPublic>({
    queryKey: ['public-event', slug],
    queryFn: async () => {
      const { data } = await api.get(`/events/public/${slug}`);
      return data;
    },
    retry: false,
  });

  const { data: leaders = [] } = useQuery<Leader[]>({
    queryKey: ['event-leaders', slug],
    queryFn: async () => {
      const { data } = await api.get(`/events/public/${slug}/leaders`);
      return data;
    },
    retry: false,
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { state: '', city: '', mobile: user?.mobile ?? '' },
  });

  const watchedState = watch('state');
  const watchedCity  = watch('city');

  // Fetch cities when state changes via countriesnow (free, no key)
  useEffect(() => {
    if (!watchedState) { setCities([]); return; }
    setCitiesLoading(true);
    setValue('city', '');
    fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'India', state: watchedState }),
    })
      .then((r) => r.json())
      .then((res) => {
        const list: string[] = res?.data ?? [];
        setCities(list.sort());
      })
      .catch(() => setCities([]))
      .finally(() => setCitiesLoading(false));
  }, [watchedState, setValue]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (isLoading) return <FullScreenSpinner />;
  if (error || !event) return <ErrorScreen title="Event not found" desc="This event link doesn't exist or has been removed." />;
  if (!event.is_active) return <ErrorScreen title="Registrations closed" desc="This event is no longer accepting registrations." />;

  if (!isAuthenticated || !user) {
    return (
      <SimpleScreen>
        <LogIn className="w-10 h-10 text-violet-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Sign in to register</h2>
        <p className="text-zinc-400 text-sm mb-6">
          You need a free Entriq account to register for <strong className="text-zinc-200">{event.name}</strong>.
        </p>
        <div className="space-y-3">
          <Button className="w-full" asChild><Link href={`/login?redirect=/e/${slug}`}>Sign in</Link></Button>
          <Button variant="outline" className="w-full" asChild><Link href={`/signup?redirect=/e/${slug}`}>Create free account</Link></Button>
        </div>
      </SimpleScreen>
    );
  }

  if (alreadyRegistered) {
    return (
      <SimpleScreen>
        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Already registered!</h2>
        <p className="text-zinc-400 text-sm mb-6">You&apos;re already registered for this event. Check your QR pass status in My Events.</p>
        <Button className="w-full" asChild><Link href="/my-events">Go to My Events →</Link></Button>
      </SimpleScreen>
    );
  }

  async function onSubmit(data: FormData) {
    // Validate referred by if leaders exist
    if (leaders.length > 0 && !referredById) {
      setReferredByError(true);
      return;
    }
    setReferredByError(false);
    setSubmitting(true);
    try {
      await api.post(`/registrations/${slug}`, {
        name: data.name, surname: data.surname, state: data.state, city: data.city,
        mobile: data.mobile, profession: data.profession,
        otherInfo: data.otherInfo || undefined,
        ...(referredById ? { referredByUserId: referredById } : {}),
      });
      toast.success('Registered! Awaiting admin approval — check My Events for updates.');
      router.push('/my-events');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const rawErr = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      // API validation errors can be ZodError objects — stringify safely
      const msg = typeof rawErr === 'string' ? rawErr : undefined;
      if (status === 409) {
        setAlreadyRegistered(true);
      } else if (status === 410) {
        toast.error('Registrations have closed.');
      } else {
        toast.error(msg ?? 'Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10">
      <div className="max-w-lg mx-auto mb-6 flex items-center gap-2">
        <Gem className="w-5 h-5 text-violet-500" />
        <span className="font-semibold text-zinc-400 text-sm">Entriq</span>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-slide-up">
        {/* Event header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <h1 className="text-xl font-semibold text-zinc-100 mb-2">{event.name}</h1>
          <div className="flex flex-col gap-1 text-sm text-zinc-400">
            {event.date && (
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
                {formatDate(event.date)}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {/* Prefilled account info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-3">Registering as</p>
          <p className="text-sm text-zinc-300"><span className="text-zinc-500">Name: </span>{user.name}</p>
          {user.mobile && <p className="text-sm text-zinc-300"><span className="text-zinc-500">Mobile: </span>+91 {user.mobile}</p>}
        </div>

        {/* Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <p className="text-sm text-zinc-400 mb-5">Please fill in a few more details to complete registration.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* First name + Last name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name">First name *</Label>
                <Input id="name" className="mt-1.5" placeholder="Rahul"
                  error={!!errors.name} {...register('name')} />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="surname">Last name *</Label>
                <Input id="surname" className="mt-1.5" placeholder="Sharma"
                  error={!!errors.surname} {...register('surname')} />
                {errors.surname && <p className="text-xs text-red-400 mt-1">{errors.surname.message}</p>}
              </div>
            </div>

            {/* State → City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="state">State *</Label>
                <div className="mt-1.5">
                  <Select
                    id="state"
                    value={watchedState}
                    onChange={(v) => { setSelectedState(v); setValue('state', v, { shouldValidate: true }); }}
                    options={INDIAN_STATES}
                    placeholder="Select state"
                    error={!!errors.state}
                  />
                </div>
                {errors.state && <p className="text-xs text-red-400 mt-1">{errors.state.message}</p>}
              </div>
              <div>
                <Label htmlFor="city">
                  City / Town *
                  {citiesLoading && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-zinc-500" />}
                </Label>
                <div className="mt-1.5">
                  {cities.length > 0 ? (
                    <Select
                      id="city"
                      value={watchedCity}
                      onChange={(v) => setValue('city', v, { shouldValidate: true })}
                      options={cities}
                      placeholder="Select city"
                      disabled={!watchedState || citiesLoading}
                      error={!!errors.city}
                    />
                  ) : (
                    <Input
                      id="city"
                      className="mt-0"
                      placeholder={watchedState ? (citiesLoading ? 'Loading cities…' : 'Enter city') : 'Select state first'}
                      disabled={!watchedState || citiesLoading}
                      error={!!errors.city}
                      {...register('city')}
                    />
                  )}
                </div>
                {errors.city && <p className="text-xs text-red-400 mt-1">{errors.city.message}</p>}
              </div>
            </div>

            {/* Mobile */}
            <div>
              <Label htmlFor="mobile">Mobile number *</Label>
              {user?.mobile ? (
                /* Pre-filled from verified account — read-only */
                <div className="mt-1.5 flex">
                  <span className="flex items-center px-3 bg-zinc-800 border border-r-0 border-zinc-700 rounded-l-xl text-sm text-zinc-400">
                    +91
                  </span>
                  <Input
                    id="mobile"
                    type="tel"
                    className="rounded-l-none bg-zinc-800/50 text-zinc-400 cursor-not-allowed"
                    readOnly
                    {...register('mobile')}
                  />
                  <span className="flex items-center px-3 bg-zinc-800 border border-l-0 border-zinc-700 rounded-r-xl text-xs text-emerald-400">
                    ✓ verified
                  </span>
                </div>
              ) : (
                <div className="mt-1.5 flex">
                  <span className="flex items-center px-3 bg-zinc-800 border border-r-0 border-zinc-700 rounded-l-xl text-sm text-zinc-400">
                    +91
                  </span>
                  <Input
                    id="mobile"
                    type="tel"
                    className="rounded-l-none"
                    placeholder="98765 43210"
                    maxLength={10}
                    error={!!errors.mobile}
                    autoComplete="tel"
                    {...register('mobile', {
                      onChange: (e) => {
                        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                      },
                    })}
                  />
                </div>
              )}
              {errors.mobile && <p className="text-xs text-red-400 mt-1">{errors.mobile.message}</p>}
            </div>

            {/* Profession */}
            <div>
              <Label htmlFor="profession">Profession *</Label>
              <Input id="profession" className="mt-1.5" placeholder="Software Engineer"
                error={!!errors.profession} {...register('profession')} />
              {errors.profession && <p className="text-xs text-red-400 mt-1">{errors.profession.message}</p>}
            </div>

            {/* Other info */}
            <div>
              <Label htmlFor="otherInfo">Any other information <span className="text-zinc-600 font-normal">(optional)</span></Label>
              <Textarea id="otherInfo" className="mt-1.5" rows={2}
                placeholder="Dietary requirements, accessibility needs, etc."
                {...register('otherInfo')} />
            </div>

            {/* Referred by — mandatory when leaders exist */}
            {leaders.length > 0 && (
              <div>
                <Label htmlFor="referredBy">
                  Referred by *
                  <span className="ml-1 text-zinc-500 font-normal text-xs">(select the leader who referred you)</span>
                </Label>
                <div className="mt-1.5">
                  <LeaderSelect
                    leaders={leaders}
                    value={referredById}
                    onChange={(id) => { setReferredById(id); setReferredByError(false); }}
                    error={referredByError}
                  />
                </div>
                {referredByError && (
                  <p className="text-xs text-red-400 mt-1">Please select the leader who referred you</p>
                )}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Registering…</>
                : 'Register for Event →'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Helper screens ───────────────────────────────────────────────────────────

function SimpleScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full animate-slide-up">
        <div className="mb-6 flex items-center gap-2">
          <Gem className="w-5 h-5 text-violet-500" />
          <span className="font-semibold text-zinc-400 text-sm">Entriq</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          {children}
        </div>
      </div>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

function ErrorScreen({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center animate-slide-up bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <p className="text-4xl mb-4">🔍</p>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">{title}</h2>
        <p className="text-zinc-400 text-sm">{desc}</p>
      </div>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}