# 31 — Account menu and notifications popover open from their button

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities (also Physicality & origin)
- **Estimated scope**: 2 files (`apps/web/src/components/layout/HeaderAccountCluster.tsx`, `apps/web/src/styles/index.css`), about 15 lines

## Problem

The two menus every staff user opens from the shell, the account menu and the notifications popover, appear with no motion at all. There is no spatial cue linking them to the avatar or bell they came from, which is most noticeable in the sidebar placement, where they open sideways.

```tsx
// apps/web/src/components/layout/HeaderAccountCluster.tsx:172-178 — current (notifications popover)
const inboxPopover = (position: string) =>
  usesNotificationPopover && notifOpen ? (
    <div
      className={cn(
        'absolute w-80 max-h-[min(70vh,420px)] flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl z-50 overflow-hidden',
        position,
      )}
    >
```

```tsx
// apps/web/src/components/layout/HeaderAccountCluster.tsx:262-268 — current (account menu)
const accountMenu = (position: string) =>
  menuOpen ? (
    <div
      className={cn(
        'absolute w-48 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl py-1 z-50',
        position,
      )}
    >
```

Call sites:
- Sidebar: `inboxPopover('bottom-full left-0 mb-2 max-w-[calc(100vw-2rem)] lg:bottom-0 lg:left-full lg:mb-0 lg:ml-3')` (about line 437) and `accountMenu('bottom-full left-0 mb-2 lg:bottom-0 lg:left-full lg:mb-0 lg:ml-3')` (about line 460).
- Header: `inboxPopover('right-0 top-full mt-1')` (about line 489) and `accountMenu('right-0 top-full mt-1')` (about line 504).

## Target

Opening is a 150ms fade with a scale from 0.97, anchored at the corner nearest the trigger. Closing stays instant, so dismissing a menu never waits. Under reduced motion only the fade remains. It uses `@starting-style`, so there is no JavaScript and no delay before the menu can be clicked.

```css
/* target — index.css, "--- Motion ---" section */
/* Menus and popovers: open from their trigger, close instantly. */
.menu-pop {
  transition:
    opacity 150ms var(--ease-out-strong),
    transform 150ms var(--ease-out-strong);
}
@starting-style {
  .menu-pop {
    opacity: 0;
    transform: scale(0.97);
  }
}
```

```css
/* target — inside the existing @media (prefers-reduced-motion: reduce) block */
  .menu-pop { transition: opacity 150ms ease; }
```

The origin depends on placement:
- Header menus open below and to the left of their button, so they use `origin-top-right`.
- Sidebar menus open above the button on small screens and beside it, bottom-aligned, on `lg`. Both cases use `origin-bottom-left`.

## Repo conventions to follow

- Motion classes live in `apps/web/src/styles/index.css` under `/* --- Motion --- */`. If plan 29 has run, add `.menu-pop` after `.toast-enter`; otherwise add it after the `.stagger` rules.
- Curve token: `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);` in the design-system `:root` block (about line 197). Add it if missing, as the first lines of that block:
  ```css
    /* Strong ease-out for entrances and feedback (Emil Kowalski's UI curve). */
    --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  ```
- Tailwind `origin-top-right` / `origin-bottom-left` utilities are available (Tailwind v4).

## Steps

1. Make sure `--ease-out-strong` exists (see conventions). Add it if missing.
2. Add the `.menu-pop` rule and its `@starting-style` block to `index.css` as in the target.
3. Add `.menu-pop { transition: opacity 150ms ease; }` inside the existing reduced-motion block.
4. In `HeaderAccountCluster.tsx`, add `menu-pop` to the first class string of both `inboxPopover` (line 176) and `accountMenu` (line 266), for example `'absolute w-48 … z-50 menu-pop'`.
5. At the two sidebar call sites, append ` origin-bottom-left` to the position string: `'bottom-full left-0 mb-2 … lg:ml-3 origin-bottom-left'`.
6. At the two header call sites, append ` origin-top-right`: `'right-0 top-full mt-1 origin-top-right'`.

## Boundaries

- Do NOT add an exit animation or delay unmounting; close must stay instant.
- Do NOT change menu contents, sizes, positions or the outside-click handling.
- Do NOT animate `Modal` or other dialogs in this plan.
- If the code differs from the excerpts, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` exits 0, and `cd apps/web && npx vite build` completes.
- **Feel check**:
  - Header placement (organizer pages at desktop width): click the avatar. The menu grows out of the avatar's corner and is fully there in about 0.15s. Click a menu item straight away; it responds with no wait.
  - Sidebar placement: open the bell and the account row. Both grow out of the bottom-left, toward the button.
  - Click outside or press the toggle again. The menu disappears immediately.
  - DevTools → Animations at 10%: scale starts at 0.97, never from 0, and the origin is the trigger corner.
  - Emulate `prefers-reduced-motion: reduce`. The menus fade in with no scale.
- **Done when**: both menus carry `menu-pop` with a placement-specific origin, and `.menu-pop` and its reduced-motion override exist in `index.css`.
