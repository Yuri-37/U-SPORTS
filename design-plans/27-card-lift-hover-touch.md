# 27 — Card lift: only on real hover, and quicker

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: MEDIUM
- **Category**: Accessibility (hover gating) / Easing & duration
- **Estimated scope**: 2 files, CSS block in `index.css` plus one class in `Hub.tsx`

## Problem

Every clickable `Card` gets the `card-lift` class (`apps/web/src/components/ui/index.tsx:96`, applied when the card has `onClick` or `interactive`). On the guest pages that covers the hub's live-game, event, sport and champion cards.

The hover rules are plain CSS with no `(hover: hover)` gate. On phones, where most guests view the hub, a tap fires a hover. The card jumps up 4px and stays lifted after the finger leaves. The duration (0.3s) and curve (ease-out) are also slow for a hover the user crosses constantly.

```css
/* apps/web/src/styles/index.css:408-433 — current */
.card-lift {
  position: relative;
  transition:
    box-shadow 0.3s ease-out,
    transform 0.3s ease-out,
    border-color 0.3s ease-out;
}
.card-lift::before {
  …
  opacity: 0;
  transition: opacity 0.3s ease-out;
  …
}
.card-lift:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lift);
}
.card-lift:hover::before { opacity: 1; }
```

The sport tiles on the hub also scale their icon on hover over 300ms. Tailwind v4's `group-hover:` is already gated to hover-capable devices, so this one is only a duration issue.

```tsx
// apps/web/src/pages/guest/Hub.tsx:528 — current
className="inline-flex items-center justify-center h-12 w-12 rounded-lg text-white shadow-sm transition-transform duration-300 group-hover:scale-110"
```

`.card-lift`'s own `transition` also replaces the global dark-mode color rule (`index.css:65-68`), so lifted cards snap their background when the theme changes.

## Target

```css
/* target */
.card-lift {
  position: relative;
  transition:
    box-shadow 200ms ease,
    transform 200ms ease,
    border-color 200ms ease,
    background-color 0.2s ease,
    color 0.2s ease;
}
.card-lift::before {
  …unchanged…
  transition: opacity 200ms ease;
}
@media (hover: hover) and (pointer: fine) {
  .card-lift:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lift);
  }
  .card-lift:hover::before { opacity: 1; }
}
```

- Hub sport tile icon: `transition-transform duration-200 ease-[ease] group-hover:scale-110`.
- The existing reduced-motion rule `.card-lift:hover { transform: none; }` at about line 491 stays and still applies.

## Repo conventions to follow

- Motion utilities live in `apps/web/src/styles/index.css` under `/* --- Card lift --- */`. Keep the block there and keep its comment.
- Reduced-motion overrides live in the single `@media (prefers-reduced-motion: reduce)` block at the end of the file. Do not move them.

## Steps

1. In `apps/web/src/styles/index.css`, in `.card-lift` (about lines 408-414), replace the three `0.3s ease-out` entries with `200ms ease`. Append `background-color 0.2s ease,` and `color 0.2s ease` as shown in the target.
2. In `.card-lift::before` (about line 422), change `transition: opacity 0.3s ease-out;` to `transition: opacity 200ms ease;`.
3. Wrap the two rules `.card-lift:hover { … }` and `.card-lift:hover::before { opacity: 1; }` (about lines 429-433) in `@media (hover: hover) and (pointer: fine) { … }`. Leave their contents unchanged.
4. In `apps/web/src/pages/guest/Hub.tsx` line 528, replace `transition-transform duration-300` with `transition-transform duration-200 ease-[ease]`.

## Boundaries

- Do NOT change the 4px lift, the shadow token or the gradient wash.
- Do NOT change `Card` in `components/ui/index.tsx`.
- If the CSS differs from the excerpt, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` exits 0, and `cd apps/web && npx vite build` completes (CSS parses).
- **Feel check**:
  - Desktop, `/guest`: hovering an event or champion card lifts it in about 0.2s, and it drops back promptly when the pointer leaves.
  - DevTools device toolbar (touch emulation) or a real phone: tap a hub card. It navigates without lifting, and when you go back no card is left floating.
  - Toggle dark mode on `/guest`. Clickable cards fade their background with the page instead of snapping.
  - Emulate `prefers-reduced-motion: reduce`. Hover shows the shadow and wash but no movement.
- **Done when**: `.card-lift:hover` exists only inside the `(hover: hover) and (pointer: fine)` media query and no `0.3s` remains in the card-lift block.
