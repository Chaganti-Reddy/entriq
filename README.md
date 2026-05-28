# Entriq — QR Code Based Secure Entry Verification SaaS

> **See `ARCHITECTURE.md` for the full technical specification.**

---

## Quick Start (Development)

### Prerequisites
- Node.js ≥ 18
- pnpm ≥ 9

### 1. Install dependencies
```bash
pnpm install --ignore-scripts
```

### 2. Set up environment variables

**Backend (`apps/api/.env`):**
```bash
cp apps/api/.env.example apps/api/.env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, JWT_REFRESH_SECRET,
#           RESEND_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
```

**Frontend (`apps/web/.env.local`):**
```bash
cp apps/web/.env.example apps/web/.env.local
# Update NEXT_PUBLIC_API_URL if your API runs on a different port
```

### 3. Set up database
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query**
3. Paste and run the entire contents of `packages/db/schema.sql`
4. Copy the **connection string** and **service role key** to `apps/api/.env`

### 4. Run in development
```bash
pnpm dev
# API runs on http://localhost:3001
# Web runs on http://localhost:3000
```

---

## Project Structure
```
entriq/
├── apps/
│   ├── api/          # Hono.js backend (TypeScript)
│   └── web/          # Next.js 14 frontend (TypeScript)
├── packages/
│   ├── db/           # Database schema + types
│   └── shared/       # Shared TypeScript types
├── ARCHITECTURE.md   # Full specification
└── README.md
```

## Key URLs (development)
| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Landing page |
| `http://localhost:3000/signup` | Create account |
| `http://localhost:3000/dashboard` | Organizer dashboard |
| `http://localhost:3000/e/:slug` | Public registration form |
| `http://localhost:3000/scan/:uniqueCode` | Admin scan page |
| `http://localhost:3001/health` | API health check |

## Production Deployment
- **Frontend:** Vercel (connect GitHub repo, set env vars)
- **Backend:** Railway (select `apps/api` root, set env vars)
- **Database:** Supabase (run schema.sql, copy connection string)
- **Email:** Resend (verify domain, copy API key)
- **Cache/Rate limit:** Upstash Redis (copy REST URL + token)

See **Section 10** of `ARCHITECTURE.md` for full deployment steps.

## Testing the full flow
1. Sign up → create event → copy registration link
2. Open the link → register with a real email
3. Check email for QR code (within 30s)
4. Scan QR with phone → enter event admin password → Approve
5. Dashboard shows `approved` status in real time
