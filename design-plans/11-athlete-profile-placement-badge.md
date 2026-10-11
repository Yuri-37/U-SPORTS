# My Profile marks a Champion finish with the gold trophy badge, like the dashboard and the Android app

Written against: 11f5963

## Evidence chain

- Surface: athlete portal, `/athlete/profile` -> "Competition placements" card (shown when the athlete's team reached a final).
- Problem: on My Profile a Champion finish is a green badge with no icon, and Runner-up is a blue badge with no icon. On the athlete dashboard the same placement is a gold (warning) badge with a trophy icon, and Runner-up has a medal icon. Every other view of a Champion finish uses gold and a trophy, so the profile is the only place where winning looks like a plain green status.
- Design evidence:
  - `apps/web/src/pages/athlete/Profile.tsx` ~L296-298: `<Badge variant={f.rank === 1 ? 'success' : 'info'} size="sm">{placementRankLabel(f.rank)}</Badge>`.
  - `apps/web/src/pages/athlete/Dashboard.tsx` ~L927-940 (Match history rows): `<Badge size="sm" variant={placement.rank === 1 ? 'warning' : 'info'} className="inline-flex items-center gap-1">` with `Trophy` (rank 1) or `Medal` (rank 2) at `w-3 h-3`.
  - The profile card's own heading already uses the gold trophy: `Profile.tsx` ~L272, `<Trophy className="w-4 h-4 text-[#FFB800]" />`.
  - Shared web/mobile feature: the Android athlete dashboard draws a Champion placement with `LayoutTokens.warning` and a trophy icon (`mobile/lib/screens/athlete/athlete_dashboard_screen.dart` ~L617-636). The web podium uses `#FFB800` and `Trophy` (`apps/web/src/components/events/EventPodiumStrip.tsx` ~L54-55).
- Owner: the placement badge in `Profile.tsx`.
- Scope and affected surfaces: the badge on each row of the Competition placements card.
- Uncertainty: none. The label text already comes from `placementRankLabel`.

## Design decision

The profile placement badge is the dashboard's placement badge: `warning` with a `Trophy` icon for Champion, `info` with a `Medal` icon for Runner-up, `size="sm"`, `inline-flex items-center gap-1`. The text stays `placementRankLabel(f.rank)`.

## Reuse

- `Badge` (`apps/web/src/components/ui`), variants `warning` and `info`.
- `Trophy`, `Medal` from `lucide-react` (`Trophy` is already imported in `Profile.tsx`).
- `placementRankLabel` (`apps/web/src/lib/eventPlacements.ts`).
- Exemplar: `apps/web/src/pages/athlete/Dashboard.tsx` ~L927-940.

No new primitive is needed. Copy the dashboard markup. If the executor extracts a shared component instead, both the dashboard and the profile must use it.

## Changes

1. `apps/web/src/pages/athlete/Profile.tsx` (~L296-298)
   - Change: variant `f.rank === 1 ? 'warning' : 'info'`; add `className="inline-flex items-center gap-1"`; render `<Trophy className="w-3 h-3" aria-hidden />` for rank 1, otherwise `<Medal className="w-3 h-3" aria-hidden />`, before the label. Import `Medal`.
   - Preserve: the label text, the "Event" button, the row layout and the sorting.
   - Verify: a Champion row shows a gold badge with a trophy; a Runner-up row shows a blue badge with a medal, the same as the dashboard's Match history badges.

## Scope

- Inherit: the Competition placements card on My Profile.
- Verify: the dashboard badges are unchanged.
- Exclude: the podium strip, the hub, and the mobile app (already gold).

## Validation

- Product: a champion sees the same gold trophy on their profile as on their dashboard and phone.
- Interface: `/athlete/profile` for an athlete with one Champion and one Runner-up finish; light and dark themes; 390px width, where the badge and the Event button share a row.
- System: the same `Badge` variants and icons as the dashboard.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if the dashboard's placement badge has changed (follow the dashboard), or if ranks beyond 2 start appearing here (decide those ranks' badge once for both pages).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
