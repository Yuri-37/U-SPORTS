# U-Sports — University Sports Management Platform

A full-stack, real-time sports management system built for NU Dasmariñas (and deployable to any institution).

## Stack

| Layer | Tech |
|---|---|
| Web Frontend | React 19 + TypeScript + Vite + Tailwind v4 |
| State | Zustand + React Router v7 |
| Charts | Recharts |
| Backend API | Node.js + Express + TypeScript |
| Database | Supabase (PostgreSQL 15 + Auth + Storage + Realtime) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Mobile | Flutter (Phase 10) |

## Project Structure

```
u-sports/
├── apps/
│   ├── web/        # React web app (all roles)
│   └── server/     # Node.js Express API
├── supabase/
│   ├── migrations/ # SQL migration files (run in order)
│   ├── functions/  # Edge Functions (Deno)
│   └── seed.sql    # Initial data for NU Dasma
├── mobile/         # Flutter app (athlete + guest only)
└── README.md
```

## Getting Started

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com). Copy **Project URL**, **anon** key, and **service_role** key from **Project Settings → API**.

For production auth email (confirmation, password reset), use **custom SMTP** so you are not limited to Supabase’s shared mail quota. Free-tier options and dashboard steps: [`supabase/SMTP.md`](supabase/SMTP.md).

### 2. Apply database migrations (pick one)

**Option A — SQL Editor (no CLI):**

```bash
pnpm db:combine
```

Open the generated `supabase/ALL_MIGRATIONS_COMBINED.sql`, copy all, paste into **Supabase → SQL → New query**, run once. Then run `supabase/seed.sql` the same way (optional but recommended).

**Option B — Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
pnpm db:push
```

Then run `supabase/seed.sql` in the SQL Editor.

Storage buckets and RLS for uploads are created by migration `008_storage.sql`. Realtime publication updates are in `004_events_brackets_matches.sql` and `006_notifications_announcements.sql`. If a line errors because a table is already in the publication, skip that line.

### 3. Environment variables

From the repo root:

```bash
pnpm env:init
```

Edit the new files and paste your keys:

**Web App** (`apps/web/.env`):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001/api
```

**Server** (`apps/server/.env`):
```
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WEB_URL=http://localhost:5173
```

### 4. Run development

```bash
# From project root
pnpm dev:web     # Web app on http://localhost:5173
pnpm dev:server  # API on http://localhost:3001
```

### 5. First-time setup (Setup Wizard)

Open http://localhost:5173 — the Setup Wizard will guide you through:
- Creating the Super Admin account
- Configuring school identity (name, colors, logo)
- Setting email domains for staff and students
- Activating sports
- Creating the first season

## Key Features

- **Role-Based Access**: Super Admin, Organizer (+ Coach), Athlete, Guest
- **Athlete Verification**: COR + Medical Certificate upload → Organizer review queue
- **Live Scoring**: Real-time scorekeeping with Supabase Realtime, undo support, scoring lock collision prevention
- **Jumbotron**: Dedicated full-screen route `/jumbotron/:matchId` for 1080p projection with animated score updates
- **Automated Bracketing**: Single Elim / Double Elim / Round Robin with seeding and byes
- **Performance Insights**: Post-game rolling 3-game vs. season average (10% threshold), cached in `insights` table
- **Emergency Announcements**: Multi-urgency, multi-audience broadcast with real-time banners
- **Organizer Presence**: Live online indicators via Supabase Realtime Presence
- **Dynamic Theming**: School colors from database, applied via CSS variables at runtime
- **Setup Wizard**: First-time deployment configuration — makes the codebase institution-agnostic

## Build Order (Phases)

1. ✅ **Foundation** — Database schema, monorepo scaffold, Supabase client
2. **Setup Wizard & Auth** — Domain validation, email/password auth, RBAC route guards
3. **Super Admin Dashboard** — Organizer invites, season lifecycle, school profile editor
4. **Athlete Registration** — Self-registration, document upload, review queue
5. **Teams, Events & Brackets** — Team CRUD, event state machine, bracket generation
6. **Live Scoring & Jumbotron** — Sport-specific scoring, real-time updates, projection view
7. **Insights & Analytics** — Post-game aggregation, insight cards, leaderboards
8. **Announcements & Presence** — Emergency broadcasts, organizer online status
9. **Guest & Athlete Dashboards** — Public hub, athlete personal stats
10. **Flutter Mobile App** — Athlete + Guest only
11. **Polish & Integration** — Testing, PDF reports, rate limiting
