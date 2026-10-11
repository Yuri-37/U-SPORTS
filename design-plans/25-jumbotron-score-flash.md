# 25 — Make the jumbotron score flash cheap, quick and reliable

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: HIGH
- **Category**: Performance (also Interruptibility, Accessibility)
- **Estimated scope**: 2 files (`apps/web/src/pages/jumbotron/JumbotronPage.tsx`, `apps/web/src/styles/index.css`), about 30 lines

## Problem

The jumbotron (`/jumbotron/:matchId`) runs unattended on an arena screen for hours. Each time a side scores, `triggerFlash` sets `flash` to `'A'` or `'B'` for 600ms. That one state change animates far more than it needs to:

1. **`transition-all` plus a 30px blur filter on the whole team column.** The column wrapper holds the HOME/AWAY label, the team name, the 14rem score and the period boxes. On a flash it scales to 105% and gains `filter: drop-shadow(0 0 30px …)`. `transition-all` animates the filter and every other property, so a 30px blur is re-rasterised over a full-height column each frame. Blur during transitions should stay under 20px, and only `transform` and `opacity` should animate.

   ```tsx
   // apps/web/src/pages/jumbotron/JumbotronPage.tsx:412-418 — current (side A; side B is identical at :502-508)
   <div
     className={`text-center transition-all duration-300 ${flash === 'A' ? 'scale-105' : ''}`}
     style={{
       filter:
         flash === 'A' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '',
     }}
   >
   ```

2. **`transition: all` on the score digits.** The digits are up to 14rem tall. `all` animates `text-shadow` (40px blur) and `color` together with `ease`.

   ```tsx
   // apps/web/src/pages/jumbotron/JumbotronPage.tsx:428-436 — current (side B at :518-526)
   style={{
     fontSize: 'clamp(5rem, 18vw, 14rem)',
     color: flash === 'A' ? 'var(--school-secondary, #FFD700)' : '#FFFFFF',
     textShadow: flash === 'A' ? '0 0 40px rgba(255, 215, 0, 0.8)' : 'none',
     transition: 'all 0.3s ease',
   }}
   ```

3. **Flashes get cut short.** Each call starts a new 600ms timer but never clears the previous one. When points land less than 600ms apart, an older timer switches `flash` off early, so the second flash blinks for a fraction of its time.

   ```tsx
   // apps/web/src/pages/jumbotron/JumbotronPage.tsx:188-191 — current
   const triggerFlash = useCallback((side: 'A' | 'B') => {
     setFlash(side)
     setTimeout(() => setFlash(null), 600)
   }, [])
   ```

4. **No reduced-motion handling.** The 105% scale plays even when the viewer has asked for reduced motion.

## Target

- Only `transform` and `color` transition. The column's `drop-shadow` filter is removed. The digit glow (`text-shadow`) stays, but it switches on and off instantly instead of animating.
- The timing is asymmetric. The flash is the system responding, so it snaps on in 150ms and relaxes over 300ms.
- Curves:
  - Transform uses a strong ease-out, added as a token: `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);`.
  - Color uses `ease`.
- Under `prefers-reduced-motion: reduce` the column does not scale. The color change still plays.
- A new point always gets its full 600ms flash.

```tsx
// target — column wrapper (side A; side B the same with 'B')
<div
  className={`text-center ${flash === 'A' ? 'motion-safe:scale-105' : ''}`}
  style={{
    transition:
      flash === 'A'
        ? 'transform 150ms var(--ease-out-strong)'
        : 'transform 300ms var(--ease-out-strong)',
  }}
>

// target — score digits (side A; side B the same with 'B')
style={{
  fontSize: 'clamp(5rem, 18vw, 14rem)',
  color: flash === 'A' ? 'var(--school-secondary, #FFD700)' : '#FFFFFF',
  textShadow: flash === 'A' ? '0 0 40px rgba(255, 215, 0, 0.8)' : 'none',
  transition: flash === 'A' ? 'color 150ms ease' : 'color 300ms ease',
}}
```

```tsx
// target — triggerFlash
const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
const triggerFlash = useCallback((side: 'A' | 'B') => {
  if (flashTimer.current) clearTimeout(flashTimer.current)
  setFlash(side)
  flashTimer.current = setTimeout(() => {
    flashTimer.current = null
    setFlash(null)
  }, 600)
}, [])
useEffect(() => () => {
  if (flashTimer.current) clearTimeout(flashTimer.current)
}, [])
```

## Repo conventions to follow

- Global motion lives in `apps/web/src/styles/index.css`. The design-system `:root` block starts at about line 197 with `--school-primary-rgb: 0, 45, 98;`. Add the curve token at the top of that block. If plan 28 has already added it, reuse it rather than adding it again.
- Tailwind v4 is in use, so `motion-safe:` is available as a variant (`motion-safe:scale-105`).
- `useRef`, `useCallback` and `useEffect` are already imported in `JumbotronPage.tsx`.
- Exemplar of a scoped transition in this repo: `.card-lift` in `index.css` lists its properties explicitly instead of using `all`.

## Steps

1. In `apps/web/src/styles/index.css`, inside the `:root {` block that begins with `/* Brand RGB triplets…` (about line 197), add as the first lines:
   ```css
     /* Strong ease-out for entrances and feedback (Emil Kowalski's UI curve). */
     --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
   ```
   Skip this step if `--ease-out-strong` already exists.
2. In `JumbotronPage.tsx`, replace `triggerFlash` (lines 188-191) with the target version above. Declare `flashTimer` right above it and add the cleanup `useEffect`.
3. Replace the side-A column wrapper (lines 412-418) with the target wrapper: remove `transition-all duration-300`, use `motion-safe:scale-105`, remove the `filter` style and add the `transition` style.
4. In the side-A score digits style (lines 428-436), replace `transition: 'all 0.3s ease'` with the target `transition` expression. Leave `color`, `textShadow` and `fontSize` as they are.
5. Repeat steps 3 and 4 for side B (wrapper at about lines 502-508, digits at about 518-526), using `'B'`.

## Boundaries

- Do NOT change the 600ms flash length, the 1.05 scale, the colors or the text-shadow values.
- Do NOT touch the clock, period boxes, LIVE pill or GAME OVER text.
- Do NOT add dependencies.
- If the code at the cited lines differs from the excerpts, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` exits 0 with no output. Note that `-p .` checks no files in this repo, because `tsconfig.json` only holds references.
- **Feel check**: open `/jumbotron/<live match id>` at 1920×1080 and score points from the organizer scoring screen in a second window.
  - The scoring side pops to 105% and turns gold almost at once, then settles back more slowly.
  - Score two points for the same side less than half a second apart. The flash stays on for the full 600ms after the second point and does not blink off early.
  - Score A, then B quickly. The A column relaxes smoothly from wherever it is, with no jump.
  - DevTools → Performance: record a flash. No long "Paint" or "Rasterize" bars appear across the whole column. Paint is limited to the digits.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. The column no longer scales, but the gold color change still shows.
- **Done when**: neither score column uses `transition-all` or `transition: all`, no `drop-shadow` filter remains in `JumbotronPage.tsx`, and `triggerFlash` clears its previous timer.
