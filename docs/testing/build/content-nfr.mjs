// Non-functional, compatibility, security and defect content.
// Every figure here was measured on 24 September 2026 against the
// production build of the web app served locally, the deployed web app,
// and the deployed API. Nothing in this file is estimated.

export const testEnvironment = [
  ['Web application under test', 'U-Sports web client, production build (Vite 6.4.2 / React 19 / TypeScript), served locally at http://localhost:4173'],
  ['API under test', 'U-Sports Express API (Node.js 22.19.0 + TypeScript), running at http://localhost:3001/api against the live Supabase project'],
  ['Mobile application under test', 'U-Sports Android client, Flutter 3.41.7 (stable), debug build installed on the emulator'],
  ['Database and authentication', 'Supabase (PostgreSQL 15, Auth, Storage, Realtime) — live project'],
  ['Deployed web application', 'https://usports-one.vercel.app (Vercel)'],
  ['Deployed API', 'https://u-sports.onrender.com/api (Render)'],
  ['Browser', 'Microsoft Edge 153.0.4234.32 (Chromium), automated with Playwright 1.49.1'],
  ['Android device', 'Android emulator, sdk_gphone64_x86_64, Android 15 (API level 35), 1080 x 1920'],
  ['Measurement tool', 'Google Lighthouse 12.2.1, headless, three runs per module'],
]

export const browserCompatibility = {
  note: 'Only the browsers installed on the test machine were exercised. Rows marked "Not checked" were not available in this environment and are reported as untested rather than assumed.',
  rows: [
    ['Microsoft Edge (Chromium)', '153.0.4234.32', 'Compatible'],
    ['Google Chrome', '—', 'Not checked — not installed on the test machine'],
    ['Mozilla Firefox', '—', 'Not checked — not installed on the test machine'],
    ['Opera GX', '—', 'Not checked — not installed on the test machine'],
  ],
}

export const androidCompatibility = {
  note: 'The application declares a minimum Android SDK through the Flutter toolchain. Only the emulator image available on the test machine was exercised; the remaining versions are reported as untested.',
  rows: [
    ['Android', '15 (API 35)', 'Successfully installed and ran'],
    ['Android', '14 (API 34)', 'Not checked — no emulator image on the test machine'],
    ['Android', '13 (API 33)', 'Not checked — no emulator image on the test machine'],
    ['Android', '12 (API 31/32)', 'Not checked — no emulator image on the test machine'],
    ['Android', '11 (API 30)', 'Not checked — no emulator image on the test machine'],
  ],
}

// Measured with: curl -I against each host, 24 September 2026.
export const securityHeaders = {
  api: {
    host: 'https://u-sports.onrender.com/api/events (Express + Helmet)',
    rows: [
      ['Content-Security-Policy', 'Present', "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests"],
      ['Strict-Transport-Security', 'Present', 'max-age=31536000; includeSubDomains'],
      ['X-Frame-Options', 'Present', 'SAMEORIGIN'],
      ['X-Content-Type-Options', 'Present', 'nosniff'],
      ['Referrer-Policy', 'Present', 'no-referrer'],
      ['Cross-Origin-Opener-Policy', 'Present', 'same-origin'],
      ['Cross-Origin-Resource-Policy', 'Present', 'same-origin'],
      ['Permissions-Policy', 'Absent', 'Not emitted by the default Helmet configuration'],
    ],
  },
  web: {
    host: 'https://usports-one.vercel.app (Vercel static hosting)',
    rows: [
      ['Strict-Transport-Security', 'Present', 'max-age=63072000; includeSubDomains; preload'],
      ['Content-Security-Policy', 'Absent', 'No policy is served with the web client'],
      ['X-Frame-Options', 'Absent', 'The client can be framed by another origin'],
      ['X-Content-Type-Options', 'Absent', 'No nosniff directive'],
      ['Referrer-Policy', 'Absent', 'Falls back to the browser default'],
      ['Permissions-Policy', 'Absent', 'No feature policy is declared'],
    ],
  },
  summary:
    'The API is hardened by Helmet and returns seven of the eight headers checked. The web client, which is served as static files by Vercel, returns only HSTS. Adding the five missing headers to the hosting configuration is recorded as recommendation R-1.',
}

// Assessed against the code in this repository, not against a checklist in the abstract.
export const secureCoding = {
  link: 'https://owasp.org/www-project-developer-guide/release/design/web_app_checklist/',
  rows: [
    ['Define Security Requirements', 'Compliant',
      'Roles (Admin, Organizer, Coach, Athlete, Guest) and their permitted actions are defined in the schema and enforced in both the API and PostgreSQL row-level security.'],
    ['Leverage Security Frameworks and Libraries', 'Compliant',
      'Helmet for response headers, express-rate-limit for abuse control, Zod for request validation and Supabase Auth for credential handling — no hand-rolled cryptography.'],
    ['Secure Database Access', 'Compliant',
      'All access goes through the Supabase client or parameterised queries; row-level security policies restrict reads and writes by role. One client query builds a PostgREST filter by string concatenation and validates every identifier against a UUID pattern first.'],
    ['Encode and Escape Data', 'Compliant',
      'React escapes interpolated values by default and the codebase sets no raw HTML from user input.'],
    ['Validate All Inputs', 'Compliant',
      'Zod schemas validate API payloads; the athlete forms constrain year level to the values valid for the chosen department, and the roster importer names the offending row rather than failing part-way.'],
    ['Implement Digital Identity', 'Compliant',
      'Supabase Auth issues and refreshes sessions. Passwords must be at least 8 characters with a letter and a number, can be changed once every 7 days, and accounts still on an issued first password are prompted to change it.'],
    ['Enforce Access Control', 'Compliant',
      'Route guards redirect a user away from a shell that does not belong to their role, and every write is re-authorised server side rather than trusted from the client.'],
    ['Protect Data Everywhere', 'Partially compliant',
      'Traffic is HTTPS end to end and secrets are held in environment variables, not in the repository. The web client is missing Content-Security-Policy and the other headers listed under recommendation R-1.'],
    ['Implement Security Logging and Monitoring', 'Compliant',
      'An audit log records administrator and organizer actions and is readable from the Super Admin shell.'],
    ['Handle All Errors and Exceptions', 'Compliant',
      'The API distinguishes timeouts, unreachable-network and genuine server errors instead of reporting one generic failure, and the client surfaces the distinction to the user.'],
  ],
}

export const defects = [
  {
    id: 'D-1',
    title: 'Coach "My Teams" rendered as a blank grey panel on Android',
    severity: 'High',
    status: 'Fixed and re-tested',
    area: 'Mobile — Coach / My Teams',
    found: 'Test case 11-1',
    description:
      'Signing in as a Coach and opening My Teams produced an empty grey rectangle below the app bar. No teams, no empty state and no error were shown, so the screen gave the coach nothing to act on and no way to tell whether the data or the app was at fault.',
    cause:
      'The screen body was a Column whose first child was the shared offline banner. That banner returns a Positioned widget, which is only valid as a direct child of a Stack; inside a Column it raises an incorrect-use-of-ParentDataWidget error during build. In a release build that error is drawn as the default error widget — a plain grey box — which is exactly what appeared. The banner was also redundant: it is already mounted application-wide in the MaterialApp builder, inside a Stack, so it already covered this screen.',
    fix:
      'Removed the duplicate banner from the screen body and collapsed the now-unnecessary Column and Expanded wrappers, leaving the RefreshIndicator as the body. Verified with flutter analyze (no issues) and by re-running the signed-in Coach flow on the emulator, where the screen now renders its content.',
    file: 'mobile/lib/screens/coach/coach_home_screen.dart',
  },
  {
    id: 'D-2',
    title: 'Athlete "My Events" is always empty',
    severity: 'Medium',
    status: 'Open',
    area: 'Web — Athlete / My Events',
    found: 'Test case 8-3',
    description:
      'The athlete My Events page reports "No events yet" for every athlete, including athletes whose team is entered in an ongoing event and whose dashboard correctly lists those same matches.',
    cause:
      'The page asks Supabase to embed event_participants through teams. event_participants.participant_id is a plain UUID with no foreign key to teams, because a participant may be either a team or an individual athlete. PostgREST therefore cannot resolve the relationship and rejects the request with HTTP 400 and error PGRST200 ("Could not find a relationship between ‘teams’ and ‘event_participants’"). The page treats the failure as an empty result.',
    fix:
      'Not yet applied. The embed has to be replaced by a two-step lookup: read the athlete’s team ids, then read event_participants filtered on those ids, joining events separately. Out of scope for this test cycle.',
    file: 'apps/web/src/pages/athlete/Events.tsx (line 17)',
  },
  {
    id: 'D-3',
    title: 'The deployed API rejects every browser request',
    severity: 'Critical',
    status: 'Open',
    area: 'Deployment — API CORS configuration',
    found: 'Environment preparation for the web test run',
    description:
      'Any request to https://u-sports.onrender.com carrying an Origin header is refused with HTTP 500. Requests without an Origin header (curl, the Android app) succeed. In practice this means the deployed web client at https://usports-one.vercel.app cannot reach its own API: signing in appears to work, but the first API-backed action — accepting the privacy notice — fails and the user cannot get past it. The Android application is unaffected because native HTTP clients send no Origin header.',
    cause:
      'The API allows an origin only when it matches the WEB_URL environment variable exactly, with a localhost exemption that is disabled when NODE_ENV is production. The WEB_URL set on the Render service does not match the deployed Vercel address, so the CORS callback returns an error for every browser origin and Express turns that into a 500.',
    fix:
      'Not a code change. Set WEB_URL on the Render service to the deployed web address, or widen the allow-list to the set of deployed origins. Verified by testing against the local API, where the same code accepts http://localhost:5173 correctly.',
    file: 'apps/server/src/index.ts (lines 52-73) — configuration, not logic',
  },
]

export const recommendations = [
  ['R-1', 'Add Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy to the web client’s hosting configuration. The API already sets these; the static client does not.'],
  ['R-2', 'Set WEB_URL on the deployed API to the deployed web address so browser requests are accepted (Defect D-3).'],
  ['R-3', 'Replace the unsupported PostgREST embed on the athlete My Events page with a two-step lookup (Defect D-2).'],
  ['R-4', 'Reserve the largest element on the public hub so its layout shift settles; the hub is the only module whose Cumulative Layout Shift exceeds the 0.1 threshold.'],
  ['R-5', 'Extend the compatibility matrix by installing Chrome and Firefox and at least one older Android emulator image, so the rows currently marked "Not checked" can be measured.'],
]

export const scopeNote =
  'This cycle covers navigation, display, data integrity, authentication, authorisation and consent across both applications, together with the non-functional measurements below. Each test case was executed against live data and the Actual Results column holds the screenshot captured at the moment of execution. Destructive write operations — creating, editing and deleting events, teams, seasons, accounts and announcements — were deliberately not executed against the production database in this cycle; the controls for them are recorded in the functionality tables and are shown present and reachable in the accompanying screenshots.'
