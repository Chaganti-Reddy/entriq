// apps/web/app/(marketing)/page.tsx
// Landing page — full design spec from architecture Section 7.1

import Link from 'next/link';
import {
  Gem,
  BarChart3,
  ShieldCheck,
  Smartphone,
  KeyRound,
  Mail,
  Sparkles,
  CalendarDays,
  QrCode,
  ArrowRight,
  Check,
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavBar } from '@/components/landing/nav-bar';

// ─── Data ─────────────────────────────────────────────────────────────────────

const steps = [
  {
    n: '01',
    icon: CalendarDays,
    title: 'Create your event',
    desc: 'Set up in 2 minutes. Add a name, date, location. Get a shareable form link instantly.',
  },
  {
    n: '02',
    icon: Mail,
    title: 'Participants register',
    desc: 'They fill a simple form. A unique QR entry pass arrives in their inbox automatically.',
  },
  {
    n: '03',
    icon: QrCode,
    title: 'Scan & approve',
    desc: 'At the gate: scan QR, enter password, tap Approve. Green screen = verified. Done.',
  },
];

const features = [
  { icon: BarChart3, title: 'Live dashboard',          desc: 'Real-time check-in analytics as people arrive.',       color: 'violet' },
  { icon: ShieldCheck,title: 'Duplicate prevention',   desc: 'Same QR scanned twice? Blocked automatically.',        color: 'green'  },
  { icon: Smartphone, title: 'Mobile-first scan',      desc: 'Designed for one-thumb use on any phone.',             color: 'blue'   },
  { icon: KeyRound,   title: 'Per-event password',     desc: 'Different password per event for gate staff.',         color: 'amber'  },
  { icon: Mail,       title: 'Auto QR email',          desc: 'QR pass delivered to registrant\'s inbox in seconds.', color: 'pink'   },
  { icon: Sparkles,   title: 'Free forever',           desc: 'No credit card. No limits on events or attendees.',    color: 'emerald'},
];

const useCases = [
  'Workshops', 'Conferences', 'Seminars', 'College fests',
  'Religious gatherings', 'Community events', 'Hackathons', 'Meetups',
  'Concerts', 'Sports events', 'Alumni meets', 'Award ceremonies',
];

const featureIconColors: Record<string, string> = {
  violet:  'bg-violet-500/10  border-violet-500/20  text-violet-400',
  green:   'bg-green-500/10   border-green-500/20   text-green-400',
  blue:    'bg-blue-500/10    border-blue-500/20    text-blue-400',
  amber:   'bg-amber-500/10   border-amber-500/20   text-amber-400',
  pink:    'bg-pink-500/10    border-pink-500/20    text-pink-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="bg-zinc-950 text-zinc-100">

      {/* ── Navbar ── */}
      <NavBar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="absolute inset-0 bg-radial-glow pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
            bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Free forever · No credit card needed
          </div>

          {/* Heading */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            <span className="text-gradient">Event check-in,</span>
            <br />
            <span className="text-white">reimagined.</span>
          </h1>

          {/* Subline */}
          <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            QR-based entry verification for any event. Set up in 2 minutes.
            Works on any phone. Participants get their QR pass in their inbox automatically.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
            <Button size="lg" className="animate-pulse-glow" asChild>
              <Link href="/signup">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          {/* Hero visual — CSS phone mockup */}
          <div className="relative inline-block">
            <div className="relative w-[280px] mx-auto rounded-[2.5rem] border-2 border-zinc-700
              bg-zinc-900 shadow-2xl shadow-violet-900/20 overflow-hidden p-2">
              {/* Phone screen — scan approved state */}
              <div className="bg-green-950 rounded-[2rem] p-6 min-h-[480px] flex flex-col items-center justify-center gap-4">
                {/* Checkmark circle */}
                <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
                  <Check className="w-10 h-10 text-green-400" strokeWidth={3} />
                </div>
                <div className="text-center">
                  <p className="text-green-300 font-bold text-xl">ENTRY VERIFIED</p>
                  <p className="text-green-400 text-sm mt-1">Rahul Sharma</p>
                  <p className="text-green-500/70 text-xs mt-1">Approved at 3:42 PM</p>
                </div>
              </div>
            </div>

            {/* Floating "live" card */}
            <div className="absolute -right-4 -bottom-4 bg-zinc-900 border border-zinc-700
              rounded-2xl p-3 shadow-xl text-xs w-44">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 font-medium">Live</span>
              </div>
              <p className="text-zinc-300 font-semibold">247 checked in</p>
              <p className="text-zinc-500 text-[11px] mt-0.5">Last: Priya S. · 3s ago</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof marquee ── */}
      <section className="py-8 border-y border-zinc-800/50 overflow-hidden">
        <div className="flex gap-3 animate-[marquee_30s_linear_infinite] whitespace-nowrap">
          {[...useCases, ...useCases].map((uc, i) => (
            <span
              key={i}
              className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-sm border border-zinc-700 shrink-0"
            >
              {uc}
            </span>
          ))}
        </div>
        <style>{`
          @keyframes marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-4">
            How Entriq works
          </h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            From setup to gate approval — in 3 simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector line */}
          <div className="absolute top-12 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent hidden md:block" />

          {steps.map(({ n, icon: Icon, title, desc }) => (
            <div
              key={n}
              className="relative group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 transition-colors"
            >
              <span className="absolute top-4 right-5 text-5xl font-bold text-zinc-800 group-hover:text-zinc-700 transition-colors select-none">
                {n}
              </span>
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="font-semibold text-zinc-100 mb-2">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="py-24 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-4">
              Everything you need.
              <span className="text-zinc-500"> Nothing you don&apos;t.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700
                  rounded-2xl p-6 transition-all hover:-translate-y-0.5"
              >
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${featureIconColors[color]}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-zinc-100 mb-1">{title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-glow pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Gem className="w-6 h-6 text-violet-500" />
              <span className="font-semibold text-zinc-100 text-xl">Entriq</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-100 mb-4">
              Start running better events today.
            </h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              Free forever. No credit card. Up and running in under 2 minutes.
            </p>
            <Button size="lg" className="animate-pulse-glow" asChild>
              <Link href="/signup">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Gem className="w-4 h-4 text-violet-500" />
              <span className="font-semibold text-zinc-100">Entriq</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer"
                className="hover:text-zinc-300 transition-colors flex items-center gap-1.5">
                <Github className="w-4 h-4" /> GitHub
              </a>
              <a href="mailto:hello@entriq.app"
                className="hover:text-zinc-300 transition-colors">
                Contact
              </a>
            </div>
            <p className="text-xs text-zinc-600">
              Built with ♥ · Zero cost · Open source
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
