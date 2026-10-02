# U-Sports — University Sports Management Platform

[![CI](https://github.com/Yuri-37/U-SPORTS/actions/workflows/ci.yml/badge.svg)](https://github.com/Yuri-37/U-SPORTS/actions/workflows/ci.yml)

A real-time intramural sports platform built for **NU Dasmariñas**: rosters, schedules, live scoring, brackets, rankings and insights, on the web and as an Android app. The institution's name, logo and colors come from the database, so it can be deployed for another school.

- Website: <https://usports.info>
- Android app: download from the website's **Get the app** page (always the latest release)

## What it does

- **Live scoring** with Supabase Realtime, undo, and a lock that stops two scorekeepers colliding. A full-screen **jumbotron** route (`/jumbotron/:matchId`) is made for projection.
- **Brackets**: single elimination, double elimination and round robin, with seeding and byes.
- **Rankings and leaderboards**: team rankings (win percentage first) and per-player season statistics for basketball, volleyball and table tennis.
- **Insights**: after each game, a rolling 3-game average is compared with the season average and cached.
- **Announcements** with an optional expiry (Manila time) and live banners; **notifications** in the app and as Android push.
- **Exports**: CSV, Excel and PDF reports.
- **Privacy**: first-login privacy notice, a downloadable copy of your data, and athlete self-service account deletion (Data Privacy Act, RA 10173).

## Roles and what each can do

| Role | Access |
|---|---|
| **Guest** | Public hub, events, brackets, rankings, team and athlete pages — no sign-in. |
| **Athlete** | Own schedule, stats and team; profile photo; download or delete own data. Web and Android. |
| **Coach** | Works with **the teams they coach** only. Creating a team makes you its coach. Analytics and exports cover their teams (or their sport, read-only, until they coach one). One sport and one department per coach. |
| **Organizer** | Everything for their **assigned sports and seasons**: athletes, teams, events, scoring, announcements, analytics. Assigns coaches to teams of their sport. |
| **Super Admin** | All sports. Creates staff accounts, seasons and the institution profile; the only other role that assigns coaches. |

The API is the enforcement point for all of this; the database additionally rejects direct writes to teams, rosters and athletes (migration 077), and the browser-facing roles cannot call the score-changing functions (migration 076).

## Stack

| Layer | Tech |
|---|---|
| Website | React 19, TypeScript, Vite, Tailwind v4, Zustand, React Router v7, Recharts |
| API | Node.js, Express, TypeScript (hosted on Render) |
| Database | Supabase: PostgreSQL, Auth, Storage, Realtime |
| Email | Supabase Auth through custom SMTP (Resend) |
| Android app | Flutter (Riverpod, go_router), guests, athletes and coaches |
| Hosting | Vercel (website), GitHub Releases (APK) |

## Project structure

```
apps/
  web/        React website (all roles)
  server/     Express API
supabase/
  migrations/ SQL, applied in order (001 …)
  functions/  Edge functions (insight computation)
  SMTP.md     Email + production setup checklist
mobile/       Flutter app
tests/        Cross-checks between the web and API copies of shared rules
docs/         Test documentation sources
.github/      CI workflow
```

## Getting started

### 1. Create a Supabase project
Copy the **Project URL**, **anon** key and **service_role** key from *Project Settings → API*. For real email (account set-up links, password resets) configure custom SMTP and the redirect allow-list: see [`supabase/SMTP.md`](supabase/SMTP.md).

### 2. Apply the database migrations
**SQL Editor:** `pnpm db:combine`, then paste `supabase/ALL_MIGRATIONS_COMBINED.sql` into *Supabase → SQL* and run it once.
**Or the CLI:** `npx supabase login`, `npx supabase link --project-ref YOUR_REF`, `pnpm db:push`.

`supabase/seed.sql` adds the NU Dasmariñas starter data (optional).

### 3. Environment variables
`pnpm env:init` creates the files; fill in your keys.

**Website** (`apps/web/.env`)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001/api
```

**API** (`apps/server/.env`)
```
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key              # re-checks passwords before a change
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://…               # direct connection
WEB_URL=http://localhost:5173                # used in email links

# Recommended in production
ACCOUNT_PASSWORD_SECRET=a-long-random-value  # keys the readable generated passwords
INITIAL_ADMIN_EMAIL=you@nu-dasma.edu.ph      # first-boot Super Admin (otherwise a default
INITIAL_ADMIN_PASSWORD=choose-one            #  account is created — change its password!)

# Optional
INVITE_EMAILS_ENABLED=false                  # stop emailing "set your password" links (default on)
FIREBASE_SERVICE_ACCOUNT_JSON=…              # Android push; without it notifications stay in-app
```

### 4. Run
```bash
pnpm dev:web      # http://localhost:5173
pnpm dev:server   # http://localhost:3001
```
On first start the API creates the Super Admin account if none exists.

### 5. Android app
```bash
cd mobile
cp .env.production.local.example .env.production.local   # Supabase URL, anon key, API URL
.\build_release.ps1                                       # builds and checks U-Sports.apk
```
Always build with the script: a plain `flutter build apk` compiles the connection settings to empty strings and produces an app that crashes on launch. Upload the APK to a GitHub release **named `U-Sports.apk`** — the website's download button points at `releases/latest/download/U-Sports.apk`.

## Accounts and passwords

Every account created from the app (staff, athlete, bulk import) is created **with a readable password** (for example `Brave-Otter-372`) that is shown once to the person creating it. A "choose your own password" email is also sent where possible; if school mail filters hold it, nobody is locked out. Passwords are derived with a server-side secret, never from public data like a student ID.

## Testing and CI

```bash
pnpm test                 # unit tests (vitest) — web, API and cross-checks
pnpm typecheck            # website + API type checks
pnpm lint
cd mobile && flutter test && flutter analyze
```
GitHub Actions runs the same checks plus a production build on every push and pull request.

## Documentation

- [`supabase/SMTP.md`](supabase/SMTP.md): email and production setup checklist
- [`docs/testing/`](docs/testing): the functional and non-functional test document and its sources
