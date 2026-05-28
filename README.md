# Entriq — QR Code Event Management SaaS

Entriq is a full-stack SaaS platform for organisations to manage events with secure QR-code-based entry verification. Built with **Hono.js** (API) + **Next.js 14** (frontend) in a **pnpm monorepo**.

---

## Features

| Area | Capabilities |
|------|-------------|
| **Auth** | Participant signup/login, org member invite, super admin panel |
| **Organisations** | Create org (pending approval), invite co-organizers, team management |
| **Events** | Create/edit events, public registration form, Indian state+city dropdowns |
| **QR Entry** | Per-attendee QR code, scan page with admin password gate, real-time check-in |
| **Dashboard** | Analytics, event management, team management, settings |
| **Super Admin** | Approve/reject/suspend orgs, full registrant drill-down per event |
| **Settings** | Profile + password for all users; org settings for admins |

---

## Project Structure

```
entriq/
├── apps/
│   ├── api/               # Hono.js backend — JWT auth, Supabase, rate limiting
│   └── web/               # Next.js 14 frontend — Tailwind, Zustand, React Query
├── packages/
│   ├── db/schema.sql      # Full Supabase schema (run this once)
│   └── shared/types.ts    # Shared TypeScript types
├── ARCHITECTURE.md        # Full technical specification
└── README.md
```

---

## Quick Start (Development)

### Prerequisites
- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- A **Supabase** project (free tier works)
- An **Upstash Redis** account (free tier — for rate limiting)
- A **Resend** account (free tier — for QR code emails)

---

### 1. Install dependencies
```bash
pnpm install --ignore-scripts
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query**
3. Paste and run the entire `packages/db/schema.sql`
4. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Create a Super Admin
Run this in Supabase SQL Editor (replace values):
```sql
INSERT INTO super_admins (name, email, password_hash)
VALUES (
  'Your Name',
  'admin@yourdomain.com',
  -- Generate bcrypt hash: https://bcrypt-generator.com (rounds=12)
  '$2a$12$...'
);
```

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

| URL | Description |
|-----|-------------|
| `/` | Landing page |
| `/signup` | Participant signup |
| `/login` | Login |
| `/my-events` | Participant dashboard (QR passes) |
| `/settings` | Account settings (all users) |
| `/create-org` | Create an organisation |
| `/e/:slug` | Public event registration form |
| `/scan/:code` | QR scan / check-in page (admin-gated) |
| `/dashboard` | Org member dashboard |
| `/dashboard/team` | Invite & manage co-organizers |
| `/dashboard/settings` | Org settings (admin only) |
| `/super-admin` | Super admin panel |
| `/super-admin/login` | Super admin login |
| `http://localhost:3001/health` | API health check |

---

## Production Deployment

### Overview
| Service | Provider | Notes |
|---------|----------|-------|
| Database | **Supabase** | Free tier: 500 MB |
| API | **Railway** | Free tier: 500 hrs/month |
| Frontend | **Vercel** | Free tier: unlimited |
| Email | **Resend** | Free: 3,000 emails/month |
| Rate Limiting | **Upstash Redis** | Free: 10,000 req/day |

---

### Step 1 — Database (Supabase)
1. Your existing Supabase project works for production
2. In **Settings → Database**, note the connection string
3. Make sure `packages/db/schema.sql` has been run

### Step 2 — API (Railway)
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo, set **Root Directory** to `apps/api`
3. Add environment variables (same as `.env` above, but update URLs):
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   JWT_SECRET=...
   JWT_REFRESH_SECRET=...
   RESEND_API_KEY=...
   EMAIL_FROM=noreply@yourdomain.com
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   PORT=3001
   ```
4. Railway auto-detects `package.json` and runs `pnpm start`
5. Note your Railway API URL (e.g. `https://entriq-api.railway.app`)

### Step 3 — Frontend (Vercel)
1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `apps/web`
3. Add environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://entriq-api.railway.app
   NEXT_PUBLIC_APP_URL=https://entriq.vercel.app
   ```
4. Deploy. Vercel auto-builds with `pnpm build`

### Step 4 — Custom Domain (optional)
- In Vercel: **Settings → Domains** → add your domain
- Update `NEXT_PUBLIC_APP_URL` in Vercel env vars to your real domain
- In Railway: **Settings → Networking** → add custom domain for API
- Update `NEXT_PUBLIC_API_URL` in Vercel to your API domain

---

## Data Integrity & Cascades

The schema uses `ON DELETE CASCADE` throughout:

```
users deleted
  └─▶ org_members deleted
        └─▶ if last admin → org deleted
              └─▶ events deleted
                    └─▶ registrations deleted
                          └─▶ checkins deleted
  └─▶ registrations deleted (as attendee)
```

This is enforced by:
1. Foreign key `CASCADE` constraints in the schema
2. A Postgres trigger (`on_org_member_deleted`) that auto-deletes orphaned orgs when their last admin is removed

---

## Testing the Full Flow

1. **Signup** → verify email (or skip if Supabase confirms instantly)
2. **Create org** → submit for approval
3. **Super admin** logs in → approves the org
4. **Admin** creates an event (gets a `/e/:slug` link)
5. **Attendee** opens the link → fills in the form → gets QR code
6. **Admin** scans QR at `/scan/:code` → enters event password → approves entry
7. Attendee's `/my-events` shows ✓ Checked in

---

## Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | API | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Service role key (bypasses RLS) |
| `JWT_SECRET` | API | Access token signing secret (32+ chars) |
| `JWT_REFRESH_SECRET` | API | Refresh token secret (different from above) |
| `RESEND_API_KEY` | API | Resend.com API key for emails |
| `EMAIL_FROM` | API | Sender address (must be verified in Resend) |
| `UPSTASH_REDIS_REST_URL` | API | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | API | Upstash Redis auth token |
| `PORT` | API | Server port (default 3001) |
| `NEXT_PUBLIC_API_URL` | Web | Full URL to the API |
| `NEXT_PUBLIC_APP_URL` | Web | Full URL to the frontend (used in QR codes) |
