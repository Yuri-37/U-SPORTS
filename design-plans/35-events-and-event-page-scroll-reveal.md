# 35 — Events list and event page: cards and match rows reveal on scroll

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: 2 files, about 10 changed lines
- **Depends on**: plan 33
- **Mobile counterpart**: plan 38 (Events tab, event detail)

## Problem

The public Events list (`/guest/events`, `apps/web/src/pages/guest/Events.tsx`) and the event page (`/guest/events/:id`, `apps/web/src/pages/EventDetailPage.tsx`) appear with no entrance at all. The hub, one click away, cascades its cards. Moving between them, the same kind of card enters one way on the hub and another way here.

```tsx
// apps/web/src/pages/guest/Events.tsx:101-105 — current (renderEventCard, used by both tabs)
<Card
  key={e.id}
  className="cursor-pointer hover:border-[var(--accent-default)]/40 transition-colors"
  onClick={() => navigate(`/guest/events/${e.slug}`)}
>
```

```tsx
// apps/web/src/pages/EventDetailPage.tsx:270-273 — current (Matches tab rows)
<Card
  key={m.id}
  className="flex flex-col sm:flex-row sm:items-stretch p-0 overflow-hidden"
>
```

## Target

- **Event cards** (both tabs of the Events list) use `reveal.card`, the same as the hub's event cards.
- **Match rows** in the event page's Matches tab use `reveal.row` (4px, 200ms, 20ms step). They are list rows, and the app's match rows use the same kind.
- **Not animated**:
  - The bracket. It is an interactive diagram with pan and zoom, and must be readable the instant the tab opens.
  - The `EventPodiumStrip` "Final rankings". It sits at the top, and its component is shared with the organizer event page (staff).
  - Headers, tabs, filters, skeletons and empty states.
- **Tabs and filters.** Switching tabs or filters, or typing in the past-results search, comes after the visitor's first input. Cards already on screen therefore show instantly, and only cards below the fold wait for scrolling (plan 33, rule 4). Filtering never replays a cascade.
- **Live updates.** The Matches list re-sorts as scores arrive (realtime refetch). Rows are keyed by `m.id`, so they keep their DOM nodes and never replay.

`EventDetailPage` is also mounted at `/athlete/events/:id` (`pages/athlete/EventDetail.tsx`), so athletes get the same reveal. That is intended: it is the same page. It is not a staff page.

## Steps

1. **`apps/web/src/pages/guest/Events.tsx`:**
   - Import `useScrollReveal` from `'../../hooks/useScrollReveal'`.
   - In the component, directly after `const navigate = useNavigate()`, add `const reveal = useScrollReveal()`.
   - In `renderEventCard`, add `ref={reveal.card}` to the `<Card key={e.id} …>`.
2. **`apps/web/src/pages/EventDetailPage.tsx`:**
   - Import `useScrollReveal` from `'../hooks/useScrollReveal'`.
   - Directly after `const navigate = useNavigate()` (line 45), add `const reveal = useScrollReveal()`. It must sit above the `if (loading) return …` early return at about line 179, or the hook order changes between renders.
   - On the match-row `<Card key={m.id} …>` (line 270), add `ref={reveal.row}`.

## Boundaries

- Do NOT touch `BracketView`, `EventPodiumStrip`, `PublicMatchDetailModal` or the organizer `pages/organizer/EventDetail.tsx`.
- Do NOT add reveal to the loading skeleton (`Skeleton`) grids.
- If `renderEventCard` no longer returns a `Card`, or the Matches tab no longer maps to `Card`s, STOP and report.

## Verification

- **Mechanical**: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` is clean.
- **Feel check**:
  - `/guest/events` at 390×844. The first cards cascade in at load, and the rest fade up as you scroll.
  - Switch to "Past results". The cards on screen show at once, and the ones further down reveal on scroll.
  - Type in the search box. Results never animate.
  - `/guest/events/<slug>?tab=matches` for an event with 15+ matches. The rows on screen arrive 20ms apart; scrolled rows rise 4px over 200ms. The bracket tab shows with no entrance.
  - On a live event, wait for a score update. No row replays its entrance.
  - Emulate `prefers-reduced-motion: reduce`. Nothing moves.
- **Done when**: both files use `useScrollReveal`, event cards are `card`, match rows are `row`, and the bracket and podium are untouched.
