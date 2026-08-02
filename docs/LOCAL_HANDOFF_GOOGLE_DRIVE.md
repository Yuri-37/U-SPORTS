# Local handoff without GitHub (Google Drive)

This guide explains how to copy the **u-sports** project to another computer using **Google Drive** (or any file share), without using GitHub, and how to install dependencies and run the app.

---

## Before you zip (sender)

### Include

- The full repository folder: `apps/`, `supabase/`, `mobile/` (only if teammates need Flutter), `package.json`, `pnpm-lock.yaml`, `scripts/`, etc.

### Exclude (keeps the archive small and avoids upload failures)

- **`node_modules`** everywhere (repo root and under `apps/web`, `apps/server`, etc.)
- Build outputs: **`dist`**, **`build`**, **`.vite`**
- Optional for mobile: `mobile/build/`, `mobile/.dart_tool/`

### Secrets and `.env`

- **Do not** put real API keys or `SUPABASE_SERVICE_ROLE_KEY` on Drive if you can avoid it.
- Prefer: zip **without** `apps/web/.env` and `apps/server/.env`, then share keys through a **private** channel (chat, password manager, in person).
- Your teammate can create env files using the README “Environment variables” section and `apps/server/.env.example` as reference.

### Package and upload

1. Delete or omit all `node_modules` folders.
2. Zip the project (e.g. `u-sports.zip`).
3. Upload to Google Drive and share the file or folder with download access.

---

## On the new laptop (receiver)

### 1. Extract the project

Unzip to a short path, for example:

- Windows: `C:\Projects\u-sports`
- macOS/Linux: `~/Projects/u-sports`

Avoid very deep folder paths (some tools complain).

### 2. Install required software

| Software | Purpose |
|----------|---------|
| **Node.js** (LTS, e.g. 20.x) | Runs the web app and API — [https://nodejs.org](https://nodejs.org) |
| **pnpm** | This monorepo uses pnpm workspaces |

Install pnpm after Node:

```bash
npm install -g pnpm
```

### Optional: local Supabase (Docker)

Only if you run the database **locally** with the Supabase CLI:

| Software | Purpose |
|----------|---------|
| **Docker Desktop** | Required for `supabase start` |
| Supabase CLI | Usually invoked as `npx supabase` from the repo (see root `package.json` scripts) |

If you use a **hosted** Supabase project only (cloud), you may not need Docker.

### Optional: Flutter mobile

Only if you work on `mobile/`:

- Install the **Flutter SDK** and platform tooling (Android Studio / Xcode as needed).

---

## 3. Install project dependencies

Open a terminal in the **repository root** (where `package.json` is).

```bash
pnpm install
```

---

## 4. Environment variables

From the repo root, you can generate starter env files (Windows PowerShell):

```bash
pnpm env:init
```

Then edit:

- **`apps/web/.env`** — typically `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (e.g. `http://localhost:3001/api`)
- **`apps/server/.env`** — `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_URL` (e.g. `http://localhost:5173`)

Values must match **one** Supabase project (the same project for web anon key and server service role key).

Full details are in the root **[README.md](../README.md)** (“Environment variables” and “Create a Supabase project”).

---

## 5. Database (pick one)

### Option A — Cloud Supabase

1. Create or use a project at [supabase.com](https://supabase.com).
2. Apply migrations (README: SQL Editor with combined SQL, or `pnpm db:push` after `npx supabase link`).
3. Run **`supabase/seed.sql`** in the SQL Editor if you want baseline data.

### Option B — Local Supabase

```bash
pnpm supabase:start
```

Then apply migrations / reset using your team’s usual flow (`pnpm db:reset`, etc.).

---

## 6. Run the app

From the **repository root**:

### Web + API together

```bash
pnpm dev
```

### Or run separately

```bash
pnpm dev:web      # Frontend (Vite; often http://localhost:5173)
pnpm dev:server   # API (default http://localhost:3001)
```

Open the URL shown in the terminal (often `http://localhost:5173`). First-time setup may use the Setup Wizard as described in the README.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `pnpm` not found | `npm install -g pnpm`, then open a **new** terminal |
| Engine / Node errors | Install current **LTS** Node and retry `pnpm install` |
| Auth or API errors | Check both `apps/web/.env` and `apps/server/.env` point to the **same** Supabase project |
| Port already in use (`3001` / `5173`) | Stop the other process or change `PORT` / Vite config after consulting your team |
| Huge zip or failed Drive upload | Remove all **`node_modules`** before zipping |
| Realtime / DB errors after copy | Migrations not applied or wrong `SUPABASE_*` URLs — re-check env and run migrations |

---

## Security reminder

Treat Google Drive like any shared folder: assume it could be reshared. **Service role keys** and production passwords should not live only in a Drive zip; use private channels or a dedicated dev Supabase project for the team laptop.
