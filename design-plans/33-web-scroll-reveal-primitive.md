# 33 — Web: one scroll-reveal hook for the public pages

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: MEDIUM (missed opportunity: entrance)
- **Category**: Missed opportunities (also Cohesion & tokens, Accessibility)
- **Estimated scope**: 2 new files, 1 new test, 2 edited files, about 140 lines
- **Part of**: scroll reveal, web (33 → 34 → 35 → 36). Mobile counterpart: plan 37.

## Problem

The public hub runs its card entrances when the page mounts, not when the cards come into view. Every grid uses `.stagger` (`apps/web/src/styles/index.css:349-355`), and that animation starts as soon as React inserts the node. The sport tiles, the stats band and "Recent champions" sit well below the fold on every screen size, so their entrance has finished before anyone scrolls to them. The motion is spent where nobody sees it.

The Events list, the Leaderboards and the event page have no entrance at all.

```css
/* apps/web/src/styles/index.css:340-355 — current */
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(0.5rem); }
  to   { opacity: 1; transform: translateY(0); }
}
…
.stagger > * { animation: fade-in-up 300ms var(--ease-out-strong) both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
…
.stagger > *:nth-child(6) { animation-delay: 200ms; }
```

`.stagger` has a second defect. It animates `transform` with `fill-mode: both`, so after the entrance the keyframe's `transform: translateY(0)` keeps winning over `.card-lift:hover { transform: translateY(-4px) }` (`index.css:461`). As a result, the hub cards that are direct `.stagger` children never lift on hover. These are the Live games, Events and sport-tile cards; the champion cards are wrapped in a div, so they still lift.

Nothing in the web app uses `IntersectionObserver` today (`grep -rn IntersectionObserver apps/web/src` → no matches).

## Target

The `animation-on-scroll` pattern, adapted to this codebase: one `IntersectionObserver` per page that pauses an item until it scrolls into view, then plays a short entrance once.

**The motion contract.** This is shared with mobile (plan 37), and each value matches the existing `.stagger` budget:

| Kind | Used for | Travel | Duration | Curve | Stagger step | Max delay |
| --- | --- | --- | --- | --- | --- | --- |
| `card` | standalone cards, tiles, a whole table, a closing block | 8px (`0.5rem`) | 300ms | `--ease-out-strong` | 40ms | 200ms |
| `row` | one item in a list of matches or standings | 4px (`0.25rem`) | 200ms | `--ease-out-strong` | 20ms | 120ms |

**The rules.** Mobile applies the same rules.

1. **Trigger line.** An item reveals when its top edge passes a line 48px above the bottom of the viewport (`rootMargin: '0px 0px -48px 0px'`, `threshold: 0`). The line is fixed in pixels rather than a percentage. Every card and row is taller than 48px minus the page's bottom padding, so even the last item on a short page always crosses it. A `-10%` margin could leave that item hidden forever.
2. **Once.** An item reveals once. After that it is never observed again and never replays on scroll.
3. **Batch stagger.** Items that enter in the same observer callback are sorted top-to-bottom, then left-to-right. Their delay is `min(index × step, max)`. A first screenful therefore cascades the way `.stagger` did, and an item scrolled in alone starts at once.
4. **Mounted after interaction appears instantly.** After the user's first `pointerdown` or `keydown` on the page, an item that mounts already inside the viewport shows instantly. Typical causes are a tab switch, a filter, search typing, a sport change or a live-match update after a click. Only items mounted below the line wait for scrolling. Content a person just asked for is never held back.
5. **Reduced motion.** Under `prefers-reduced-motion: reduce` the hook does nothing, and a CSS backstop forces every `[data-reveal]` element to its final state. Print does the same.
6. **No blur and no long travel.** The skill's sample keyframe uses `blur(8px)`, `30px` and `0.8s`. That is deliberately not used: it is too slow and too big for a page people come back to repeatedly for live scores, and a blur filter on many cards is costly to paint.
7. **No conflict with hover lift.** The keyframes animate the individual `translate` property, not `transform`, and use `fill-mode: backwards`. Once finished, nothing from the reveal stays applied, so `.card-lift:hover` works.

## Repo conventions to follow

- Motion tokens live in `apps/web/src/styles/index.css` under `/* --- Motion --- */`. Use `var(--ease-out-strong)` (defined at about line 200). Do not retype the curve.
- Hooks live in `apps/web/src/hooks/` (see `useMediaQuery.ts`). Pure helpers with unit tests live in `apps/web/src/lib/` next to a `*.test.ts` file (see `lib/liveMatchPresentation.test.ts`, run by the root `pnpm test` → `vitest run`).
- `Card` (`apps/web/src/components/ui/index.tsx:66-116`) does not take a `ref` yet. React 19 passes `ref` as an ordinary prop, so add it to `CardProps` and put it on the `<div>`. Do not use `forwardRef`.
- `main.tsx` renders in `<React.StrictMode>`. In development, React 19 attaches each ref callback, detaches it and attaches it again on mount. The hook below is written so that this re-observes a pending element instead of leaving it invisible.

## Steps

1. **Create `apps/web/src/lib/scrollReveal.ts`:**

   ```ts
   /**
    * Scroll-reveal timing shared by every public page. Mirrors AppMotion.reveal*
    * in mobile/lib/theme/motion.dart, so the site and the app move the same way.
    */
   export type RevealKind = 'card' | 'row'

   /** Gap between items that come into view together. */
   export const REVEAL_STEP_MS: Record<RevealKind, number> = { card: 40, row: 20 }

   /** No item waits longer than this, however many arrive at once. */
   export const REVEAL_MAX_DELAY_MS: Record<RevealKind, number> = { card: 200, row: 120 }

   /** Distance above the bottom of the viewport an item must pass before it reveals. */
   export const REVEAL_INSET_PX = 48

   export function revealDelayMs(index: number, kind: RevealKind): number {
     return Math.min(Math.max(0, index) * REVEAL_STEP_MS[kind], REVEAL_MAX_DELAY_MS[kind])
   }
   ```

2. **Create `apps/web/src/lib/scrollReveal.test.ts`:**

   ```ts
   import { describe, expect, it } from 'vitest'
   import { revealDelayMs } from './scrollReveal'

   describe('scroll reveal delay', () => {
     it('starts the first item at once', () => {
       expect(revealDelayMs(0, 'card')).toBe(0)
       expect(revealDelayMs(0, 'row')).toBe(0)
     })
     it('steps cards by 40ms and rows by 20ms', () => {
       expect(revealDelayMs(3, 'card')).toBe(120)
       expect(revealDelayMs(3, 'row')).toBe(60)
     })
     it('never waits longer than the cap', () => {
       expect(revealDelayMs(50, 'card')).toBe(200)
       expect(revealDelayMs(50, 'row')).toBe(120)
     })
   })
   ```

3. **Create `apps/web/src/hooks/useScrollReveal.ts`:**

   ```ts
   import { useEffect, useMemo, useRef } from 'react'
   import { REVEAL_INSET_PX, revealDelayMs, type RevealKind } from '../lib/scrollReveal'

   type RevealRef = (el: HTMLElement | null) => void | (() => void)

   const canAnimate = () =>
     typeof IntersectionObserver !== 'undefined' &&
     !window.matchMedia('(prefers-reduced-motion: reduce)').matches

   const inViewport = (el: HTMLElement) => {
     const r = el.getBoundingClientRect()
     return r.top < window.innerHeight && r.bottom > 0
   }

   /**
    * Items fade and rise once as they scroll into view. Call once per page and
    * put `reveal.card` or `reveal.row` on each item's `ref`.
    *
    * After the visitor's first click or key press, anything that mounts already
    * on screen (a tab, a filter, a live update) shows at once; only what is
    * still below the fold waits to be scrolled to.
    */
   export function useScrollReveal(): { card: RevealRef; row: RevealRef } {
     const observerRef = useRef<IntersectionObserver | null>(null)
     const interactedRef = useRef(false)

     useEffect(() => {
       const mark = () => {
         interactedRef.current = true
       }
       window.addEventListener('pointerdown', mark, { capture: true, passive: true })
       window.addEventListener('keydown', mark, { capture: true })
       return () => {
         window.removeEventListener('pointerdown', mark, { capture: true })
         window.removeEventListener('keydown', mark, { capture: true })
         observerRef.current?.disconnect()
         observerRef.current = null
       }
     }, [])

     return useMemo(() => {
       const observer = () => {
         if (observerRef.current) return observerRef.current
         const io = new IntersectionObserver(
           (entries) => {
             const entering = entries
               .filter((e) => e.isIntersecting)
               .sort(
                 (a, b) =>
                   a.boundingClientRect.top - b.boundingClientRect.top ||
                   a.boundingClientRect.left - b.boundingClientRect.left,
               )
             entering.forEach((entry, i) => {
               const el = entry.target as HTMLElement
               io.unobserve(el)
               const kind: RevealKind = el.dataset.revealKind === 'row' ? 'row' : 'card'
               el.style.setProperty('--reveal-delay', `${revealDelayMs(i, kind)}ms`)
               el.dataset.reveal = 'shown'
               const done = (ev: AnimationEvent) => {
                 // Ignore animations bubbling up from inside the card (score pops, pulses).
                 if (ev.target !== el || !ev.animationName.startsWith('reveal-up')) return
                 el.removeEventListener('animationend', done)
                 delete el.dataset.reveal
                 delete el.dataset.revealKind
                 el.style.removeProperty('--reveal-delay')
               }
               el.addEventListener('animationend', done)
             })
           },
           { threshold: 0, rootMargin: `0px 0px -${REVEAL_INSET_PX}px 0px` },
         )
         observerRef.current = io
         return io
       }

       const attach =
         (kind: RevealKind): RevealRef =>
         (el) => {
           if (!el || el.dataset.reveal === 'shown') return
           if (el.dataset.reveal !== 'pending') {
             if (!canAnimate()) return
             if (interactedRef.current && inViewport(el)) return
             el.dataset.reveal = 'pending'
             el.dataset.revealKind = kind
           }
           const io = observer()
           io.observe(el)
           return () => io.unobserve(el)
         }

       return { card: attach('card'), row: attach('row') }
     }, [])
   }
   ```

   Why it is shaped this way:
   - The two ref callbacks are created once (`useMemo([])`), so React attaches them only on mount and unmount, not on every live-score re-render.
   - The pending state is set inside the ref callback, which runs during commit before paint. An item below the fold never flashes visible first.
   - An element that is already `pending` when it is attached again (StrictMode) is simply observed again.

4. **Edit `apps/web/src/styles/index.css`.**
   - Directly after the `.stagger` rules (after line 355), add:

     ```css
     /*
       Scroll reveal (hooks/useScrollReveal.ts): an item waits, invisible, until it
       scrolls into view, then fades and rises once. `translate` (not `transform`)
       and `backwards` fill, so nothing stays applied afterwards and .card-lift's
       hover still works. Values mirror AppMotion.reveal* in the Android app.
     */
     @keyframes reveal-up {
       from { opacity: 0; translate: 0 0.5rem; }
     }
     @keyframes reveal-up-row {
       from { opacity: 0; translate: 0 0.25rem; }
     }
     [data-reveal='pending'] { opacity: 0; }
     [data-reveal='shown'] {
       animation: reveal-up 300ms var(--ease-out-strong) var(--reveal-delay, 0ms) backwards;
     }
     [data-reveal='shown'][data-reveal-kind='row'] {
       animation-name: reveal-up-row;
       animation-duration: 200ms;
     }
     @media print {
       [data-reveal] { opacity: 1; animation: none; }
     }
     ```

   - Inside the existing `@media (prefers-reduced-motion: reduce)` block at the end of the file (about line 511), add as its first rule:

     ```css
       [data-reveal] {
         animation: none;
         opacity: 1;
       }
     ```

5. **Edit `apps/web/src/components/ui/index.tsx` (`Card`).**
   - Add to `CardProps`:

     ```ts
       /** For scroll reveal and similar; React 19 passes it as a normal prop. */
       ref?: React.Ref<HTMLDivElement>
     ```

   - Destructure `ref` in the `Card({ … })` parameters and add `ref={ref}` on the root `<div>`.
   - Change nothing else.

## Boundaries

- Do NOT change `.stagger`, `.animate-fade-in-up` or `@keyframes fade-in-up`. App Details (`pages/guest/AppDetails.tsx`) still uses them and is outside this work. Plans 34-36 move the in-scope pages off `.stagger`.
- Do NOT add a dependency (no framer-motion, no AOS). `IntersectionObserver` is built into every supported browser.
- Do NOT use any of this on staff pages (`pages/organizer`, `pages/super-admin`). Staff screens are for work; plan 30's rule is that nothing there waits on motion.
- Do NOT add `blur()` or a scale to the keyframes.
- If `Card`'s props or root element differ from the excerpt above, STOP and report.

## Verification

- **Mechanical**:
  - `pnpm test` (repo root) passes, including the three new `scroll reveal delay` cases.
  - `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` is clean. (The bare `-p .` form checks no files.)
  - `cd apps/web && npx vite build` completes.
- **Behavior**: nothing is visible yet, because no page uses the hook. Plans 34-36 carry the feel checks.
- **Done when**: the hook, the helper, its test, the CSS rules with their reduced-motion and print backstops, and the `Card` `ref` prop all exist, and every check passes.
