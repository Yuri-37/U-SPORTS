# 29 — Give toasts their own quick entrance

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: MEDIUM
- **Category**: Easing & duration (also Interruptibility, Cohesion)
- **Estimated scope**: 2 files (`apps/web/src/components/ui/ToastHost.tsx`, `apps/web/src/styles/index.css`), about 15 lines

## Problem

Toasts confirm every save, delete and import in the organizer and super-admin pages, for example "Team deleted" or "Roster saved". They borrow the public hub's page-entrance animation. Today that is a 700ms keyframe that rises 1.75rem (28px), so the confirmation of a save slides up the screen instead of just appearing:

```tsx
// apps/web/src/components/ui/ToastHost.tsx:28-31 — current
className={cn(
  'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-[var(--surface-card)] px-3.5 py-3 text-sm text-[var(--text-primary)] shadow-2xl animate-fade-in-up',
  s.ring,
)}
```

```css
/* apps/web/src/styles/index.css:337-343 — current */
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(1.75rem); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

There are two more problems:

- The toast's timing is coupled to a marketing animation. Plan 28 retunes `fade-in-up` for the hub, and any later hub change would silently change save feedback too.
- It is a keyframe. Toasts arrive in bursts (the stack keeps up to 3, `stores/toastStore.ts:25`), and keyframes restart from zero instead of retargeting.

## Target

A dedicated, transition-based toast entrance: 200ms, 0.5rem (8px) rise and fade, using the strong ease-out curve `cubic-bezier(0.23, 1, 0.32, 1)`. It is driven by `@starting-style`, so it needs no JavaScript and stays interruptible. The exit stays instant, because a dismissed toast should simply be gone. Under reduced motion only the fade remains.

```css
/* target — index.css, in the "--- Motion ---" section */
/* Toasts: feedback for saves. Quick and small; never the page-entrance animation. */
.toast-enter {
  transition:
    opacity 200ms var(--ease-out-strong),
    transform 200ms var(--ease-out-strong);
}
@starting-style {
  .toast-enter {
    opacity: 0;
    transform: translateY(0.5rem);
  }
}
```

```css
/* target — added inside the existing @media (prefers-reduced-motion: reduce) block */
  .toast-enter { transition: opacity 200ms ease; }
```

```tsx
// target — ToastHost.tsx: replace `animate-fade-in-up` with `toast-enter`
'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-[var(--surface-card)] px-3.5 py-3 text-sm text-[var(--text-primary)] shadow-2xl toast-enter',
```

Browsers without `@starting-style` support (Chrome before 117, Safari before 17.5, Firefox before 129) show the toast with no animation, which is acceptable.

## Repo conventions to follow

- Motion classes live in `apps/web/src/styles/index.css` under `/* --- Motion --- */` (about line 335). Add `.toast-enter` right after the `.stagger` rules.
- Curve token: `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);` in the design-system `:root` block (about line 197, starting `/* Brand RGB triplets… */`). Plans 25 and 28 also add it. If it is missing, add it as the first lines of that block:
  ```css
    /* Strong ease-out for entrances and feedback (Emil Kowalski's UI curve). */
    --ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  ```
- Reduced-motion overrides live in the single `@media (prefers-reduced-motion: reduce)` block (about line 478).

## Steps

1. Make sure `--ease-out-strong` exists (see conventions). Add it if missing.
2. In `index.css`, after the `.stagger > *:nth-child(6)` rule, add the `.toast-enter` rule and its `@starting-style` block exactly as in the target.
3. Inside the existing `@media (prefers-reduced-motion: reduce) { … }` block, add `.toast-enter { transition: opacity 200ms ease; }`.
4. In `apps/web/src/components/ui/ToastHost.tsx` line 30, replace `animate-fade-in-up` with `toast-enter`. Change nothing else.

## Boundaries

- Do NOT change toast lifetimes, the stack size, the position or the colors (`stores/toastStore.ts`, `STYLE` map).
- Do NOT add an exit animation.
- Do NOT edit `.animate-fade-in-up` / `.stagger`; they belong to the public pages (plan 28).
- If the code differs from the excerpts, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` exits 0, and `cd apps/web && npx vite build` completes (CSS parses). `grep -n "animate-fade-in-up" apps/web/src/components/ui/ToastHost.tsx` prints nothing.
- **Feel check**: in `/organizer/teams`, save a team edit.
  - The "saved" toast is readable almost at once. It rises a few pixels and stops in about 0.2s, with no long slide.
  - Trigger three saves quickly. Each toast appears quickly and none restarts a long animation.
  - DevTools → Animations at 10%: the toast travels 8px and finishes in 200ms.
  - Emulate `prefers-reduced-motion: reduce`. The toast fades in without moving.
- **Done when**: ToastHost uses `toast-enter`, and the class and its reduced-motion override exist in `index.css`.
