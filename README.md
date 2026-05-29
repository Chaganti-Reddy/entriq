# Entriq — QR Code Event Management SaaS

Entriq is a production-ready, multi-tenant SaaS platform for organisations to manage events with secure QR-code-based entry verification. Built on a **pnpm monorepo** with a **Hono.js** API on Cloudflare Workers and a **Next.js 14** frontend on Vercel.

---

## Features

| Area | Capabilities |
|------|-------------|
| **Auth** | Supabase-backed signup/login, JWT access + refresh tokens, forgot/reset password |
| **Organisations** | Create org (pending admin approval), invite co-organizers, org settings |
| **Per-event Teams** | Assign any user as co-organizer or scanner for a specific event (independent of org membership) |
| **Multi-role Users** | A person can be an org admin AND a scanner/co-organizer at another org's event simultaneously |
| **Events** | Create/edit events, public registration form, Indian state+city dropdowns, event gate password |
| **QR Entry** | Per-attendee QR code emailed on registration, mobile-optimised scanner with gate password, real-time check-in |
| **Dashboard** | Stats, event management, per-event team management, registrations list, CSV export |
| **Super Admin** | Approve/reject/suspend orgs, full registrant drill-down per event, org detail view |
| **Settings** | Profile + password for all users; org name + contact email for admins |
| **Pending State** | Users whose org is pending approval can still access their event scanner/co-organizer assignments |

---

## Project Structure

```
entriq/
├── apps/
│   ├── api/                       # Hono.js API — runs on Cloudflare Workers
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── auth.ts        # Login, signup, refresh, reset password
│   │       │   ├── events.ts      # CRUD events, requireEventAccess guard
│   │       │   ├── event-members.ts  # Per-event team assignments
│   │       │   ├── registrations.ts  # Event registrations + CSV export
│   │       │   ├── checkins.ts    # QR check-in, password verify
│   │       │   ├── members.ts     # Org-level team (invite, role, remove)
│   │       │   ├── user.ts        # Profile, create-org, event-assignments
│   │       │   ├── analytics.ts   # Dashboard stats
│   │       │   └── super-admin.ts # SA auth, org management
│   │       ├── middleware/
│   │       │   ├── auth.ts        # JWT verification
│   │       │   └── roles.ts       # requireRole, requireEventAccess
│   │       └── services/
│   │           └── db.ts          # Supabase client
│   └── web/                       # Next.js 14 frontend
│       └── app/
│           ├── (marketing)/       # Landing page
│           ├── auth/              # Login, signup, reset-password
│           ├── e/[slug]/          # Public event registration form
│           ├── my-events/         # Attendee QR pass view
│           ├── scan/[code]/       # QR scan / self-checkin page
│           ├── pending-approval/  # Org pending state (shows event assignments)
│           ├── create-org/        # Create new organisation
│           ├── settings/          # Account settings
│           ├── dashboard/         # Org member dashboard
│           │   ├── page.tsx           # Stats, events, create-org CTA, external assignments
│           │   ├── events/[id]/       # Event detail + registrations
│           │   │   ├── scan/          # Mobile QR scanner
│           │   │   └── team/          # Per-event team management
│           │   ├── team/              # Org-level team management
│           │   └── settings/          # Org settings
│           └── super-admin/       # SA panel
├── packages/
│   ├── db/schema.sql              # Full Supabase schema (run once)
│   └── shared/types.ts            # Shared TypeScript types
├── ARCHITECTURE.md                # Full technical specification
└── README.md
```

---

## Role System

Entriq has four layers of access control:

| Role | Scope | Can do |
|------|-------|--------|
| `super_admin` | Platform | Approve/reject orgs, view all data |
| `admin` | Org | Full org management, create events, manage team |
| `co_organizer` | Org or Event | View events, manage registrations, run scanner |
| `scanner` | Event only | Open scanner for the specific event only |

> A user can hold **multiple roles simultaneously** — e.g. admin of their own org, and scanner at a different org's event.

### Access flow
- `isEventMember: true` in JWT → user has no org membership, assigned directly to event(s)
- Org members (`admin` / `co_organizer`) bypass per-event access checks — org membership grants full access to all org events
- When an event-only user creates their own org, their org goes to `pending` state. They can still access their event assignments from the pending-approval page.

---

## Quick Start (Development)

### Prerequisites
- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- A **Supabase** project (free tier works)
- An **Upstash Redis** account (free tier — for rate limiting)
- A **Resend** account (free tier — for QR code emails)

### 1. Install dependencies
```bash
pnpm install --ignore-scripts
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query**
3. Paste and run the entire contents of `packages/db/schema.sql`
4. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Create a Super Admin

Super admins use their own table, separate from Supabase Auth. First create a Supabase Auth user for your SA account (normal signup flow), then link it:

```sql
-- 1. Get your Supabase Auth user id
SELECT id FROM auth.users WHERE email = 'you@example.com';

-- 2. Create the super_admin row linked to it
INSERT INTO super_admins (name, email, supabase_user_id)
VALUES ('Your Name', 'you@example.com', '<uuid from step 1>');
```

Login at `/super-admin/login` using the same email/password as your normal Supabase Auth account.

### 4. Set up environment variables

**Backend** (`apps/api/.env`):
```bash
cp apps/api/.env.example apps/api/.env
```
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

JWT_SECRET=your-32-char-random-secret
JWT_REFRESH_SECRET=your-different-32-char-secret

RESEND_API_KEY=re_xxxx
EMAIL_FROM=noreply@yourdomain.com

UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...

PORT=3001
```

**Frontend** (`apps/web/.env.local`):
```bash
cp apps/web/.env.example apps/web/.env.local
```
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run in development
```bash
pnpm dev
# API  → http://localhost:3001
# Web  → http://localhost:3000
```

---

## Key URLs

| URL | Who | Description |
|-----|-----|-------------|
| `/` | Anyone | Landing page (auth-aware header) |
| `/signup` | Anyone | Create an account |
| `/login` | Anyone | Login |
| `/auth/forgot-password` | Anyone | Request password reset email |
| `/auth/reset-password` | Anyone | Set new password (from email link) |
| `/my-events` | Attendees | View registrations + QR passes |
| `/settings` | All logged-in users | Profile + password settings |
| `/create-org` | Logged-in users | Submit a new organisation for approval |
| `/pending-approval` | Pending org users | Status check + event assignment access |
| `/e/:slug` | Anyone | Public event registration form |
| `/scan/:code` | Anyone | QR pass / self-checkin view |
| `/dashboard` | Org members + event members | Main dashboard |
| `/dashboard/events/:id` | Org members + co-organizers | Event detail + registrations |
| `/dashboard/events/:id/scan` | All roles | Mobile QR gate scanner |
| `/dashboard/events/:id/team` | Admins | Per-event team assignments |
| `/dashboard/team` | Admins + co-organizers | Org-level team management |
| `/dashboard/settings` | Admins | Org settings |
| `/super-admin` | Super admins | Platform management panel |
| `/super-admin/login` | Super admins | SA login |

---

## Production Deployment

| Service | Provider | Notes |
|---------|----------|-------|
| Database | **Supabase** | Free tier: 500 MB |
| API | **Cloudflare Workers** | Free tier: 100k req/day |
| Frontend | **Vercel** | Free tier: unlimited |
| Email | **Resend** | Free: 3,000 emails/month |
| Rate Limiting | **Upstash Redis** | Free: 10,000 req/day |

### Step 1 — Database (Supabase)
1. Run `packages/db/schema.sql` in SQL Editor if you haven't already
2. Enable Row Level Security is already set in the schema — no extra steps

### Step 2 — API (Cloudflare Workers)
1. Install Wrangler: `npm i -g wrangler`
2. Login: `wrangler login`
3. Create a KV namespace for sessions if needed
4. Set secrets:
   ```bash
   cd apps/api
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put JWT_SECRET
   wrangler secret put JWT_REFRESH_SECRET
   wrangler secret put RESEND_API_KEY
   wrangler secret put EMAIL_FROM
   wrangler secret put UPSTASH_REDIS_REST_URL
   wrangler secret put UPSTASH_REDIS_REST_TOKEN
   ```
5. Deploy: `pnpm --filter api deploy`
6. Note your Workers URL (e.g. `https://entriq-api.yourname.workers.dev`)

### Step 3 — Frontend (Vercel)
1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `apps/web`
3. Add environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://entriq-api.yourname.workers.dev
   NEXT_PUBLIC_APP_URL=https://entriq-web.vercel.app
   ```
4. Deploy. Vercel auto-builds with `pnpm build`

### Step 4 — Custom Domain (optional)
- Vercel: **Settings → Domains** → add your domain, update `NEXT_PUBLIC_APP_URL`
- Cloudflare Workers: add a custom route in `wrangler.toml`, update `NEXT_PUBLIC_API_URL`

---

## Testing the Full Flow

1. **Signup** at `/signup` — creates a Supabase Auth account
2. **Create org** at `/create-org` — org goes to `pending` state
3. **Super admin** logs in at `/super-admin/login` → approves the org
4. **Admin** goes to `/dashboard` → creates an event with a gate password
5. **Attendee** opens `/e/:slug` → fills in the form → receives QR code by email
6. **Scanner** opens `/dashboard/events/:id/scan` on mobile → enters gate password → scans QR → approves entry
7. Attendee's `/my-events` shows ✓ Checked in

### Testing multi-role
1. Admin creates an event and assigns a regular user as **scanner** via `/dashboard/events/:id/team`
2. That user logs in → sees their assigned event on dashboard
3. They can open the scanner for that event but cannot access registrations or team settings
4. If they create their own org → org goes `pending` → they land on `/pending-approval` → their event assignments are still listed and accessible there

---

## API Endpoints Reference

```
POST   /auth/signup                    Create account
POST   /auth/login                     Login
POST   /auth/refresh                   Refresh JWT
POST   /auth/forgot-password           Send reset email
POST   /auth/reset-password            Set new password

GET    /user/profile                   Get own profile
PATCH  /user/profile                   Update profile + password
POST   /user/create-org                Create new org (event-only members)
GET    /user/event-assignments         Get all event_members rows for user

GET    /events                         List events (filtered by role)
POST   /events                         Create event [admin]
GET    /events/:id                     Get event detail
PATCH  /events/:id                     Update event [admin]
DELETE /events/:id                     Delete event [admin]

GET    /events/:id/members             List per-event team
POST   /events/:id/members             Assign user to event team [admin/co_org]
PATCH  /events/:id/members/:memberId   Update role [admin/co_org]
DELETE /events/:id/members/:memberId   Remove from event team [admin/co_org]

GET    /registrations/event/:id        List registrations for event
GET    /registrations/export/:id       Export registrations as CSV [admin]
POST   /registrations                  Register for event (public)

GET    /checkin/:uniqueCode            Look up registration by QR code (public)
POST   /checkin/verify-password        Validate gate password before opening scanner
POST   /checkin/:uniqueCode            Approve entry (requires gate password)

GET    /members                        List org members
POST   /members/invite                 Invite member to org [admin]
PATCH  /members/:id                    Update member role [admin]
DELETE /members/:id                    Remove member [admin]

GET    /analytics/overview             Dashboard stats

POST   /super-admin/login              SA login
GET    /super-admin/orgs               List all orgs
PATCH  /super-admin/orgs/:id/status    Approve/reject/suspend org
GET    /super-admin/orgs/:id           Org detail with events + registrations
```

---

## Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | API | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Service role key (bypasses RLS) |
| `JWT_SECRET` | API | Access token signing secret (32+ chars) |
| `JWT_REFRESH_SECRET` | API | Refresh token secret (must differ from above) |
| `RESEND_API_KEY` | API | Resend.com API key for emails |
| `EMAIL_FROM` | API | Sender address (must be verified in Resend) |
| `UPSTASH_REDIS_REST_URL` | API | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | API | Upstash Redis auth token |
| `PORT` | API | Server port for local dev (default 3001) |
| `NEXT_PUBLIC_API_URL` | Web | Full URL to the API (no trailing slash) |
| `NEXT_PUBLIC_APP_URL` | Web | Full URL to the frontend — used in QR code URLs |

---

## Data Model Summary

```
users (Supabase Auth)
  └── org_members  ─────────────── (role: admin | co_organizer)
        └── orgs
              └── events
                    ├── registrations
                    │     └── checkins
                    └── event_members ─── (role: co_organizer | scanner)
                                           (links to users, not org_members)

super_admins  (separate table, linked to Supabase Auth)
```

Cascades: deleting an org deletes all its events, registrations, checkins, and members. Deleting a user deletes their org_members row; if they were the last admin, a Postgres trigger auto-deletes the orphaned org.

