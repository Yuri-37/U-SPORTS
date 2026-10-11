# 28 — Faster, smaller page entrances on the hub and App Details

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: MEDIUM
- **Category**: Easing & duration (also Cohesion & tokens)
- **Estimated scope**: 1 file (`apps/web/src/styles/index.css`), about 12 lines

## Problem

The public hub (`/guest`, also the signed-out home) and App Details (`/app`) fade their hero and every card grid up from 1.75rem (28px) below over 700ms. Grids add a stagger of up to 300ms, so the sixth card is fully settled about 1 second after the page shows.

Guests return to the hub repeatedly to check live scores. At that frequency the entrance holds back the thing they came for, and a 28px rise reads as a slide rather than a settle. The same curve is also hand-typed twice instead of living as a token.

```css
/* apps/web/src/styles/index.css:337-352 — current */
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(1.75rem); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Staggered children: set on the parent, children pick up an index delay. */
.stagger > * { animation: fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
.stagger > *:nth-child(1) { animation-delay: 0.05s; }
…
.stagger > *:nth-child(6) { animation-delay: 0.3s; }
```

Used at `apps/web/src/pages/guest/Hub.tsx:275, 330, 484, 515, 604` and `apps/web/src/pages/guest/AppDetails.tsx:154, 190, 246, 390`.

## Target

- Travel 0.5rem (8px), duration 300ms (the UI budget is under 300ms), curve `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`.
- Keep the stagger but tighten it to 40ms steps, which sits in the 30–80ms range. The sixth card then starts at 240ms and everything has settled by about 540ms.
- The reduced-motion block (`index.css` about lines 478-492) already resolves these to their final state and stays unchanged.

```css
/* target */
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(0.5rem); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fade-in-up 300ms var(--ease-out-strong) both;
}

/* Staggered children: set on the parent, children pick up an index delay. */
.stagger > * { animation: fade-in-up 300ms var(--ease-out-strong) both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 40ms; }
.stagger > *:nth-child(3) { animation-delay: 80ms; }
.stagger > *:nth-child(4) { animation-delay: 120ms; }
.stagger > *:nth-child(5) { animation-delay: 160ms; }
.stagger > *:nth-child(6) { animation-delay: 200ms; }
```

## Repo conventions to follow

- Tokens live in `apps/web/src/styles/index.css`. The design-system `:root` block starts at about line 197 with `/* Brand RGB triplets… */ --school-primary-rgb: 0, 45, 98;`.
- Plan 25 adds `--ease-out-strong` there. If it is not present yet, add it as the first lines of that block:
  ```css
    /* Strong ease-out for entrances and feedback (Emil Kowalski's UI curve). */
    --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  ```

## Steps

1. Make sure `--ease-out-strong` exists in the design-system `:root` block (see conventions). Add it if it is missing.
2. In the `@keyframes fade-in-up` block (about line 337-340), change `translateY(1.75rem)` to `translateY(0.5rem)`.
3. Change `.animate-fade-in-up` to `animation: fade-in-up 300ms var(--ease-out-strong) both;`.
4. Change `.stagger > *` to `animation: fade-in-up 300ms var(--ease-out-strong) both;`.
5. Replace the six `nth-child` delays with `0ms, 40ms, 80ms, 120ms, 160ms, 200ms` as in the target.

## Boundaries

- Do NOT remove the entrance or the stagger. Only the distance, duration, curve and delays change.
- Do NOT touch the hero ring/float animations, `.card-lift`, or the reduced-motion block.
- Do NOT edit `Hub.tsx` or `AppDetails.tsx`; they keep their `stagger` / `animate-fade-in-up` classes.
- If the CSS differs from the excerpt, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx vite build` completes. `grep -n "0.7s" apps/web/src/styles/index.css` no longer matches the fade-in-up rules.
- **Feel check**:
  - Hard-reload `/guest`. The hero text and card grids settle almost at once with a slight upward drift, not a visible slide. Nothing should still be moving after about half a second.
  - Navigate Hub → Events → back to Hub. The return feels instant, not like a presentation replaying.
  - DevTools Animations panel at 10%: cards start 40ms apart and each travels 8px.
  - Emulate `prefers-reduced-motion: reduce`. Everything appears in place with no movement.
- **Done when**: both rules use `300ms var(--ease-out-strong)`, the keyframe travels `0.5rem`, and the delays are 0–200ms in 40ms steps.
