# The super-admin dashboard stat cards use the app's status words ("Ongoing", "Active")

Written against: 11f5963

## Evidence chain

- Surface: super-admin `/super-admin` (dashboard), the stat row: "Live Events" and "Current Season".
- Problem: under "Live Events" the card says "In Progress", but staff pages call that event status "Ongoing" (event cards, tabs and the event page header). Under "Current Season" the card prints the raw status "active" in lowercase, while the Seasons page in this portal badges the same season "Active".
- Design evidence (direct contradictions within the same task):
  - `apps/web/src/pages/super-admin/Dashboard.tsx` ~L48: `<StatCard label="Live Events" ... subValue="In Progress" />`; ~L49-53: `subValue={stats?.currentSeason?.status ?? ''}`.
  - `apps/server/src/routes/admin.ts` `GET /admin/stats` (~L56-76): `activeEvents` counts events with `status = 'in_progress'`; `currentSeason` is selected with `status = 'active'`, so the subValue is always the raw string "active".
  - Owner for staff event statuses: `organizerEventStatusLabel` in `apps/web/src/lib/utils.ts` ('in_progress' -> "Ongoing"), used by `apps/web/src/pages/organizer/Dashboard.tsx` ~L457, the organizer Events cards and the event page header.
  - Season status on the Seasons page: `apps/web/src/pages/super-admin/Seasons.tsx` ~L416, `{formatEnumLabel(s.status)}` ("Active").
- Owner: the stat card subValues in `Dashboard.tsx`.
- Scope and affected surfaces: two `subValue` strings.
- Uncertainty: none.

## Design decision

"Live Events" uses `organizerEventStatusLabel('in_progress')` ("Ongoing"). "Current Season" uses `formatEnumLabel(stats.currentSeason.status)` ("Active"), the same as the Seasons page badge. When there is no current season the subValue stays empty, as now. Card labels, values and layout are unchanged.

## Reuse

- `organizerEventStatusLabel`, `formatEnumLabel` from `apps/web/src/lib/utils.ts`.
- `StatCard` (`apps/web/src/components/ui/index.tsx`), unchanged.
- Exemplars: `apps/web/src/pages/organizer/Dashboard.tsx` ~L457; `apps/web/src/pages/super-admin/Seasons.tsx` ~L416.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/super-admin/Dashboard.tsx` (~L48)
   - Change: `subValue={organizerEventStatusLabel('in_progress')}`; import it from `../../lib/utils`.
   - Preserve: the label "Live Events" and the count.
   - Verify: the card reads "Live Events / N / Ongoing".
2. `apps/web/src/pages/super-admin/Dashboard.tsx` (~L49-53)
   - Change: `subValue={stats?.currentSeason ? formatEnumLabel(stats.currentSeason.status) : ''}`; import `formatEnumLabel`.
   - Preserve: the season name as the value, and "None" when there is no active season.
   - Verify: the card reads "Current Season / AY 2026-2027 / Active".

## Scope

- Inherit: the super-admin dashboard.
- Verify: the "Active Athletes" card ("Active") is unchanged.
- Exclude: the stats API and the organizer dashboard.

## Validation

- Product: a super admin sees the same status words on the dashboard as on the Events and Seasons pages they lead to.
- Interface: `/super-admin` with an active season and at least one ongoing event, and with no active season; light and dark themes; 390px width (two-column stat grid).
- System: both subValues come from the existing label helpers.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `organizerEventStatusLabel('in_progress')` stops returning "Ongoing", or if the stats endpoint starts returning a season that is not active (then show that season's own formatted status, which this plan already does).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
