# 26 — Replace `transition-all` on buttons, tabs and bracket cards with explicit properties

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 3 files, 4 one-line class edits

## Problem

`transition-all` animates every property that changes, not only the ones intended. That includes layout properties, and it runs work off the GPU path. Here it sits on the most-clicked controls in the guest pages and the athlete portal:

```tsx
// apps/web/src/components/ui/index.tsx:26-27 — current (Button base, used on every page)
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold rounded-[10px] transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none'
```

```tsx
// apps/web/src/components/ui/index.tsx:637 — current (TabBar tab: Events, event Bracket/Matches, Leaderboards)
'flex items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-all duration-150',
```

```tsx
// apps/web/src/pages/guest/AppDetails.tsx:287 — current (Download APK button)
className="inline-flex items-center justify-center gap-2 h-14 px-7 rounded-xl bg-white text-[var(--school-primary)] font-semibold shadow-[var(--shadow-lift-lg)] transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98]"
```

```tsx
// apps/web/src/components/brackets/BracketView.tsx:61 — current (each bracket match card on the public and athlete event pages)
'border rounded-xl overflow-hidden transition-all text-left',
```

There is a second cost. `apps/web/src/styles/index.css:65-68` gives every element a color-only transition (`background-color`, `border-color`, `color`, `fill`, `stroke`, each `0.2s ease`) so dark mode fades smoothly. Any class that sets `transition-property` replaces that rule on its element. The replacements below therefore list the color properties explicitly, so dark-mode fading keeps working on these controls.

## Target

Each element transitions only what actually changes on it:

| Element | Changes on interaction | Target classes (replace `transition-all …`) |
| --- | --- | --- |
| Button base | press scale, hover brightness, colors, shadow, disabled opacity | `transition-[transform,filter,background-color,border-color,color,box-shadow,opacity] duration-[160ms] ease-out` |
| TabBar tab | colors, border, shadow when it becomes active | `transition-[background-color,border-color,color,box-shadow] duration-150 ease-[ease]` |
| Download APK button | hover lift, press scale, shadow | `transition-[transform,box-shadow] duration-[160ms] ease-out` |
| Bracket match card | hover border and glow | `transition-[border-color,box-shadow,opacity] duration-150 ease-[ease]` |

Press feedback stays `active:scale-[0.98]`, within the subtle 0.95–0.98 range, at 160ms ease-out. Hover and color changes use `ease`.

## Repo conventions to follow

- Tailwind v4 arbitrary values are already used in this codebase (`rounded-[10px]`, `shadow-[var(--shadow-raised)]`), so `transition-[…]`, `duration-[160ms]` and `ease-[ease]` fit.
- Exemplar of an explicit transition list: `.card-lift` in `apps/web/src/styles/index.css` (`box-shadow`, `transform`, `border-color`).

## Steps

1. `apps/web/src/components/ui/index.tsx` line 27: in the `base` string, replace `transition-all duration-200 ease-out` with `transition-[transform,filter,background-color,border-color,color,box-shadow,opacity] duration-[160ms] ease-out`. Keep every other class.
2. Same file, line 637 (TabBar button): replace `transition-all duration-150` with `transition-[background-color,border-color,color,box-shadow] duration-150 ease-[ease]`.
3. `apps/web/src/pages/guest/AppDetails.tsx` line 287: replace `transition-all duration-200 ease-out` with `transition-[transform,box-shadow] duration-[160ms] ease-out`.
4. `apps/web/src/components/brackets/BracketView.tsx` line 61: replace `transition-all` with `transition-[border-color,box-shadow,opacity] duration-150 ease-[ease]`.

## Boundaries

- Do NOT change colors, sizes, the `active:scale-[0.98]` value or the hover effects.
- Do NOT touch other `transition-colors` / `transition-transform` classes; they are already scoped.
- Do NOT change the global color rule in `index.css`.
- If a line does not match the excerpt, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` exits 0. Then `grep -rn "transition-all" apps/web/src/components/ui/index.tsx apps/web/src/pages/guest/AppDetails.tsx apps/web/src/components/brackets/BracketView.tsx` prints nothing.
- **Feel check**:
  - Press and hold any Button (Hub "Browse events"). It dips to 98% quickly and springs back on release. Hover on a primary button still brightens.
  - Switch tabs on `/guest/events` and on an event page (Bracket / Matches). The active tab's background and shadow fade in about 150ms.
  - Hover a clickable bracket match card. The blue border and glow fade in.
  - Toggle dark mode with these controls on screen. Buttons, tabs and bracket cards fade their colors like the rest of the page instead of snapping.
  - DevTools Animations panel at 10%: only the listed properties appear as animating.
- **Done when**: the four elements use the target classes and the grep above is empty.
