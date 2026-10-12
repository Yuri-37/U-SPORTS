# Design plans

Each plan is self-contained: it lists the files, the current code, the exact target and how to verify it. Plans 01–24 came from UI audits (wording, badges and components). Plans 25–28 came from a motion audit of the guest pages, the jumbotron and the athlete portal. Plans 29–31 came from a motion audit of the organizer and super-admin pages, limited to quick feedback that never slows work down. Plan 32 came from a motion audit of the Android app. Plans 33–39 add a scroll reveal: web first (33–36: hub, Events, event page, Leaderboards), then the same behaviour in the Android app (37–39) using Flutter's own widgets.

## Status

| # | Title | Area | Severity | Status |
| --- | --- | --- | --- | --- |
| 01–18 | Web UI consistency (labels, badges, headers, pagination) | web | — | DONE (331ac87) |
| 05, 06, 19–24 | Android UI consistency | mobile | — | DONE (107fd88) |
| 25 | Make the jumbotron score flash cheap, quick and reliable | web / jumbotron | HIGH | DONE |
| 26 | Replace `transition-all` on buttons, tabs and bracket cards | web / shared | MEDIUM | DONE |
| 27 | Card lift: only on real hover, and quicker | web / shared CSS | MEDIUM | DONE |
| 28 | Faster, smaller page entrances on the hub and App Details | web / shared CSS | MEDIUM | DONE |
| 29 | Give toasts their own quick entrance | web / staff feedback | MEDIUM | DONE |
| 30 | Collapse the sidebar instantly; crisp mobile drawer slide | web / staff shell | MEDIUM | DONE |
| 31 | Account menu and notifications popover open from their button | web / staff shell | LOW | DONE |
| 32 | Android: live scores tick in when they change | mobile | MEDIUM | DONE |
| 33 | Web: one scroll-reveal hook for the public pages | web / shared | MEDIUM | DONE |
| 34 | Hub: cards reveal as they scroll into view | web / hub | MEDIUM | DONE |
| 35 | Events list and event page reveal on scroll | web / guest | LOW | DONE |
| 36 | Leaderboards: table and team rankings reveal on scroll | web / guest | LOW | DONE |
| 37 | Android: one scroll-reveal widget from Flutter's own tools | mobile / shared | MEDIUM | DONE |
| 38 | Android: Home, Events and the event screen reveal on scroll | mobile | MEDIUM | DONE |
| 39 | Android: Rankings, sport and team screens reveal on scroll | mobile | LOW | DONE |
| 40 | Dramatic scroll reveal (replaces the numbers in 33–39) and round portrait navigation | web + mobile | MEDIUM | DONE |

## Recommended order (motion plans)

1. **25**: adds the shared curve token `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`.
2. **26**: four class edits. It also covers the staff pages, because Button and TabBar are shared.
3. **29**: toasts on every save. Uses the token.
4. **30**: one class string in `Sidebar.tsx`.
5. **28**: uses the token.
6. **27**: card-lift CSS.
7. **31**: uses the token.
8. **32** (mobile, independent): adds `mobile/lib/theme/motion.dart`, the app's first motion tokens, which mirror the web curve.

## Scroll reveal (33–39)

- Run web first: 33, then 34, 35 and 36 in any order. Then mobile: 37, then 38 and 39 in any order.
- One shared contract, stated in plan 33 and copied by plan 37:
  - cards fade and rise 8px over 300ms;
  - rows fade and rise 4px over 200ms;
  - the curve is the strong ease-out;
  - items arriving together are staggered 40ms (cards) or 20ms (rows), capped at 200ms or 120ms;
  - an item reveals once, when it passes 48px above the bottom of the screen;
  - after the first click or touch, content that mounts already on screen shows at once;
  - reduced motion (prefers-reduced-motion, or Android "Remove animations") shows everything immediately.
- Staff pages, auth, settings, notifications and coach screens get nothing. On mobile, a `Reveal` without a `RevealScope` is inert.
- No new packages. The web uses IntersectionObserver and CSS; the app uses scroll notifications, post-frame positions, `FadeTransition` and `Transform.translate`.
- Code was dry-run in a throwaway worktree at c5ef129:
  - web: `tsc`, `vite build` and the new vitest pass, and a Playwright harness confirmed the load cascade, reveal on scroll, no replay, the instant-after-click rule, reduced motion and the restored hover lift;
  - mobile: `flutter analyze` is clean and all 32 tests pass with plans 37–39 applied.

Plan 40 later made the reveal much bigger (70px, spring, count-up numbers, sliding headings and rows). Its numbers replace the ones written in 33–39.

## Dependencies

- 25, 28, 29 and 31 all use `--ease-out-strong`. Each one adds it if it is missing, so only the first to run creates it.
- 27, 28, 29 and 31 edit `apps/web/src/styles/index.css`. Run them one after another, not in parallel.
- 29 detaches toasts from `.animate-fade-in-up`, so plan 28's hub changes no longer affect save feedback.

## Checks

For mobile plans, run `cd mobile && flutter analyze` and `flutter test`. For plan 33, also run `pnpm test` at the repo root. For every web plan, run `cd apps/web && npx tsc --noEmit -p tsconfig.app.json`. The bare `-p .` form checks no files, because `tsconfig.json` only holds project references. The plans that touch CSS also ask for `npx vite build`.
