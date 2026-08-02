# u_sports_mobile

Flutter app for **guests**, **students**, and **athletes** (organizer/admin must use web).

## Configuration

Run with compile-time defines (see [`lib/config/env.dart`](lib/config/env.dart)):

**Do not run `flutter run` by itself** — `SUPABASE_URL` / `SUPABASE_ANON_KEY` will be empty and every Supabase query will error (`No host specified in URI /rest/v1/...`). Use the scripts or VS Code launch configs below.

```bash
flutter run ^
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co ^
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY ^
  --dart-define=API_URL=http://10.0.2.2:3001/api
```

- **Android emulator:** use `10.0.2.2` to reach the API on the host machine (`localhost` on your PC).
- **iOS simulator:** often `http://127.0.0.1:3001/api` works from the simulator.
- **Physical device:** use your PC’s LAN IP, e.g. `http://192.168.1.10:3001/api`. Prefer [`run_physical.ps1`](run_physical.ps1) so `SUPABASE_URL` is rewritten to the same host (`http://<LAN>:54321`).

**Local Supabase (`http://…`) on Android:** cleartext HTTP is blocked by default. This app sets `android:usesCleartextTraffic="true"` so debug builds can reach local PostgREST/API. Use HTTPS in production.

**PowerShell “not digitally signed”:** if `.\run_physical.ps1` is blocked by execution policy, use **`run_physical.bat`** (same folder) or run:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\run_physical.ps1`

## Live scores on the hub & events

The app listens to Supabase Realtime (`matches`, `match_scores`, `scoring_actions`) **and** refreshes every **2 seconds** while a game is **live** so scores keep moving even if the WebSocket hiccups.

Apply DB migrations on the Supabase project you point the phone at — especially [`../supabase/migrations/036_realtime_scoring_actions.sql`](../supabase/migrations/036_realtime_scoring_actions.sql) so `scoring_actions` is in the `supabase_realtime` publication (needed for quarter/period labels and some UI paths).
