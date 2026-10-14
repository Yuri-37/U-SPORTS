# 42 — Secondary colour everywhere it counts, the new logo, a bouncing-ball loader, skeletons, scroll fix, nav hides for sheets

- **Status**: DONE (website + Android 1.10.21)

## Secondary colour (website and app)
The secondary colour only ever sits ON the primary or is a decorative shape (bar, dot, ring, badge); it is never body text on white.
- **Heading accent bar** under every section heading (hub, App Details; app section headers).
- **Kicker dot** in the section label pill.
- **Big numbers** on the brand colour (hub stats band; app hero figures). Falls back to white when the secondary does not stand out on the primary (`accentOnPrimary`).
- **First place**: #1 rank badge on Leaderboards and in the app, the champion tile on the event screen, the featured champion frame on the hub.
- **Selected navigation**: the underline on the website menu; a ring around the raised button in the app (and the sideways arc).
- **Footer stripe** on the website footer. App Details install-step numbers.
- The tinted shadows/textures and the brand text colour on a light page now follow the primary (they were stuck on the original navy): `--school-primary-rgb`, `--school-ink` set in `applyTheme`.
- **Contrast warning** on the staff colour settings page when the two colours are closer than 2.5:1 (`lib/colorContrast.ts`).

## Logo
`brand/` files drive everything (`scripts` not needed; generated once): website favicon.svg/.ico/apple-touch-icon, the small mark tile in headers, the Android launcher icon (+ adaptive foreground), and the native splash. The splash shows the full lockup (the U mark over "SPORTS"); there is no separate bottom branding line because "SPORTS" is the lettering that completes the U.

## Website loader
A basketball bouncing on a shadow replaces the spinner and "Loading U-Sports…". The markup + CSS live in `index.html` so it shows before any script arrives (no blank page); `components/ui/BallLoader.tsx` continues it. Dark mode is applied from storage by a tiny inline script. Reduced motion: the ball holds still and pulses.

## Scroll
`<ScrollRestoration />` in `App.tsx`: every page opens at the top; Back returns to where you were.

## Skeletons
Website: skeleton heights now match the real cards (hub 124px, events 134px, leaderboard rows, athlete, team, event page). App: `widgets/ui/skeleton.dart` (event card, live-match card, list rows, table) with a soft shared pulse and no extra package, still under Remove animations; used on Home, Events, event screen, Rankings, sport and team screens.

## App: navigation hides for sheets
`showAppSheet` (`widgets/ui/app_sheet.dart`) wraps `showModalBottomSheet`; the floating bar slides away while any sheet is open, so it never covers a sheet's buttons (the live-match sheet's "Event page", the profile-photo sheet).
