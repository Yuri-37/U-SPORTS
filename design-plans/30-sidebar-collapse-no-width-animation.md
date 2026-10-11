# 30 — Collapse the sidebar instantly and keep a crisp slide for the mobile drawer

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: MEDIUM
- **Category**: Performance (also Easing & duration, Accessibility)
- **Estimated scope**: 1 file (`apps/web/src/components/layout/Sidebar.tsx`), 1 class string

## Problem

The staff sidebar animates `width` when it collapses on desktop (220px ↔ 72px). Width is a layout property, so every frame of those 200ms re-lays-out the whole page beside it. On the organizer pages that means wide tables (Teams, Athletes, Events), bracket views and charts reflowing about 12 times. The labels inside the sidebar are removed instantly (`!collapsed && …`), so the animated width only shows a half-width bar with icons drifting while text has already gone.

The same class also drives the mobile drawer slide (`translate-x`). It uses Tailwind's default curve, and it has no reduced-motion handling.

```tsx
// apps/web/src/components/layout/Sidebar.tsx:98-103 — current
className={cn(
  'z-50 flex h-full shrink-0 flex-col bg-[var(--shell-frame)] transition-[width,transform] duration-200',
  'fixed inset-y-0 left-0 w-[260px] shadow-2xl lg:relative lg:z-40 lg:bg-transparent lg:shadow-none',
  drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
  collapsed ? 'lg:w-[72px]' : 'lg:w-[220px]',
)}
```

## Target

- Desktop collapse and expand is instant: no width transition, so the page re-lays-out once.
- The mobile drawer still slides, using `transform` only, over 200ms with the drawer curve `cubic-bezier(0.32, 0.72, 0, 1)`.
- Under reduced motion the drawer appears without sliding.

```tsx
// target — first class string
'z-50 flex h-full shrink-0 flex-col bg-[var(--shell-frame)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
```

## Repo conventions to follow

- Tailwind v4 arbitrary values and variants are used across the repo (`rounded-[10px]`, `lg:w-[72px]`), so `ease-[cubic-bezier(0.32,0.72,0,1)]` and `motion-reduce:` fit.
- Exemplar of a transform-only transition in this repo: the Toggle thumb in `apps/web/src/components/ui/index.tsx:462` (`transition-transform duration-200`).

## Steps

1. In `apps/web/src/components/layout/Sidebar.tsx` line 99, replace `transition-[width,transform] duration-200` with `transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none`. Leave the other three class lines unchanged.

## Boundaries

- Do NOT change widths, the backdrop, `inert` handling or the collapse button.
- Do NOT add a width animation back in another form (for example `max-width`, `grid-template-columns` or a CSS variable).
- If the line does not match the excerpt, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` exits 0.
- **Feel check**:
  - Desktop (≥1024px), `/organizer/teams`: click the collapse button. The sidebar switches to icons in one frame and the table jumps once to its new width, with no 200ms reflow.
  - DevTools → Performance: record a collapse. There is one layout pass, not a run of layouts across frames.
  - Mobile width (390px): open the menu. The drawer slides in quickly and settles without a long tail. Tapping the backdrop slides it out.
  - Emulate `prefers-reduced-motion: reduce`. The drawer appears and disappears without sliding.
- **Done when**: the sidebar class has no `width` in its transition and uses the drawer curve.
