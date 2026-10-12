# 40 — Dramatic scroll reveal (revision of plans 33–39) and the round portrait navigation

- **Status**: DONE
- **Commit**: 4b4d82c (web) and the Android release commit that follows it
- **Why**: plans 33–39 chose a deliberately small 8px / 300ms reveal. On a large monitor that was easy to miss, so the brief became "dramatic, on purpose overkill". This plan records the new values. It replaces the numbers in plans 33 to 39; where the two differ, this plan wins.

## The contract (web and Android use the same numbers)

| | Plans 33–39 | Now |
| --- | --- | --- |
| Card | rise 8px, 300ms | rise **70px**, start at **85% size**, **800ms**, settles with a spring overshoot |
| Row | rise 4px, 200ms | slide in **48–64px from alternating sides**, **700ms**, starts at 94% size |
| Section heading | not animated | slides in **from the left** with a fade, 700ms |
| Stat numbers | not animated | **count up** from 0 to their value over 1.4s |
| Stagger | 40ms (cards), 20ms (rows) | **100ms**, capped at **400ms** (so the last item lands within about 1.2s) |
| Curve | strong ease-out | spring `cubic-bezier(0.34, 1.56, 0.64, 1)` for the move, plain ease-out for the fade |
| Blur | none | **web only**: 10px to 0 on the fade. None on Android. |

Kept as before: each item plays once; after the first click or touch anything already on screen shows at once; `prefers-reduced-motion` (web) and Remove animations (Android) show everything immediately; staff pages and the auth, settings and coach screens are untouched.

## Web

- `apps/web/src/lib/scrollReveal.ts`: new step, cap, count-up helper (`countUpAt`) and a `heading` kind. Unit tests updated.
- `apps/web/src/hooks/useScrollReveal.ts`: adds `reveal.heading`; rows get `data-reveal-side` (left, right, left, …); the "first click" flag is now module-wide so the count-up shares it; exports `canAnimateReveal`, `hasInteracted` and `inViewport`.
- `apps/web/src/styles/index.css`: `--ease-spring`; fade and move are two separate animations (opacity cannot overshoot). Only `opacity`, `filter: blur`, `translate` and `scale` animate, so the card hover lift still works afterwards.
- `apps/web/src/components/marketing/CountUp.tsx` (new), used by `StatCell` and `MiniStat` through an opt-in `countUp` prop, so App Details is unchanged.
- `SectionHeading` takes an optional `ref`; only the hub passes one, so the staff Analytics page that also uses it is unchanged.
- Leaderboards and the event page get `overflow-x-clip` on their root so a row sliding in from the right never makes the page scroll sideways.

## Android

- `mobile/lib/theme/motion.dart`: the new tokens (`spring`, distances, scales, durations, `revealStep`, `revealMaxDelay`, `countUp`).
- `mobile/lib/widgets/ui/reveal.dart`: `Reveal` has `card`, `row` and `heading` kinds, with a separate fade and spring move, and rows alternate sides. `CountUpText` counts up only inside a `RevealScope`. Fade, slide and scale only.
- `SectionHeader(reveal: true)` is used by Home and the team screen; `FrostedStats` counts its figures up inside a scope (Home and team hero; other screens have no scope, so nothing changes there).

## Portrait navigation

Now a rounded bar in the card colour with a raised round button for the current page, sitting in a notch cut into the bar (the bar floats over the page, nothing behind it, so content scrolls underneath). The button is the school navy with a white icon and a soft glow; the other tabs show a dark icon with their label under it, and the current tab shows its label. Tapping another tab slides the button and its notch across on the same spring as the reveal, so it overshoots the target, and the button leans into the move and swings back upright as it lands. No ring, pop or other tap effect. Remove animations makes it jump with no motion. The sideways layout keeps its arc of round buttons.

## Checks

- Web: `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run` (57 tests) and `vite build` pass. A browser test confirmed the 100ms cascade capped at 400ms, a card starting about 70px low at 85% size, rows alternating sides, no sideways page scroll, the stat counting up to the exact number, the instant-after-click rule, and reduced motion.
- Android: `flutter analyze` is clean and all 36 tests pass, including new tests for the overshoot, the alternating rows, the heading and the count-up. The release APK was checked on the emulator.
