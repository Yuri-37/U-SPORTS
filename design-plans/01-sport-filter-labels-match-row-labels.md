# Sport filter options use the same sport names as the rows they filter

Written against: 11f5963

## Evidence chain

- Surface: organizer and super-admin record lists in the signed-in app shell: `/organizer/events`, `/organizer/athletes`, `/organizer/teams` (each filters a list by sport).
- Problem: on each of these pages the Sport filter offers "Table tennis", while every row or card on the same page names the sport "Table Tennis". The same sport is spelled two ways on one screen, between the control that filters the list and the list it filters.
- Design evidence (direct contradiction on the same screen):
  - `apps/web/src/pages/organizer/Events.tsx` L171-174: Select options `{ value: 'table-tennis', label: 'Table tennis' }`; the same page's cards render `{formatEnumLabel(e.format)} · {getSportLabel(e.sport as any)}` (L261).
  - `apps/web/src/pages/organizer/Athletes.tsx` L48-53: `SPORT_FILTER_OPTIONS` with `label: 'Table tennis'`; rows render `<SportTag sport={a.sport} ... />`, which prints `getSportLabel(sport)` (`apps/web/src/components/ui/SportIcon.tsx`, `SportTag`).
  - `apps/web/src/pages/organizer/Teams.tsx` L1418-1424: filter options with `label: 'Table tennis'`; team cards render `{getSportLabel(team.sport as any)}` (L1486).
- Owner: `getSportLabel` in `apps/web/src/lib/utils.ts` returns `'Table Tennis'` for `'table-tennis'`; it is the label every row, card, badge and `SportTag` on these pages already uses.
- Scope and affected surfaces: the three Sport filter `<Select>` option lists above.
- Uncertainty: none.

## Design decision

Every sport filter option takes its text from `getSportLabel`, so the filter and the list always name a sport identically ("Table Tennis"). Only the option text changes; option values, ordering and the "All sports" first option stay as they are.

## Reuse

- `getSportLabel(sport: Sport)` from `apps/web/src/lib/utils.ts`
- Exemplar: `apps/web/src/hooks/useOrganizerSportScope.ts` (`sportOptionsForForms` lists "Basketball", "Volleyball", "Table Tennis"), and the sport options in `apps/web/src/pages/organizer/Announcements.tsx` ("Table Tennis").

No new primitive is needed.

## Changes

1. `apps/web/src/pages/organizer/Events.tsx` (Sport filter `<Select>`, ~L171-174)
   - Change: build the three sport options' `label` with `getSportLabel(...)` for `basketball`, `volleyball` and `table-tennis` (already imported in this file), keeping `{ value: '', label: 'All sports' }` first.
   - Preserve: option values, order, the `sportFilter` state and the filtering logic.
   - Verify: the filter reads "Table Tennis", matching the card subtitle "Single Elim · Table Tennis".
2. `apps/web/src/pages/organizer/Athletes.tsx` (`SPORT_FILTER_OPTIONS`, ~L48-53)
   - Change: same; labels from `getSportLabel` (already imported).
   - Preserve: the `Sport | ''` typing and option values.
   - Verify: the filter option reads "Table Tennis", like the rows' sport tags.
3. `apps/web/src/pages/organizer/Teams.tsx` (team list Sport filter options, ~L1418-1424)
   - Change: same; labels from `getSportLabel` (already imported).
   - Preserve: option values and the surrounding filter layout.
   - Verify: the filter option reads "Table Tennis", like the team cards.

## Scope

- Inherit: the three Sport filters listed above.
- Verify: no other sport label on these pages changes (cards, rows and badges already use `getSportLabel`).
- Exclude: `apps/web/src/lib/liveMatchPresentation.ts` and `apps/web/src/components/events/PublicMatchDetailModal.tsx` ("Table tennis" inside score-summary sentences on public surfaces), which are outside this audited surface; and any change to filtering behavior.

## Validation

- Product: an organizer filtering Events, Athletes or Teams by sport sees the same sport name in the filter as in the results.
- Interface: open each of the three pages, open the Sport filter, select Table Tennis, and confirm the option text and the result rows both read "Table Tennis". Check light and dark themes and a 390px viewport where the filters wrap.
- System: no new constant or helper is introduced; the labels come from `getSportLabel`.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `getSportLabel` no longer returns "Table Tennis" for `table-tennis`, or if any of these filters has been replaced by a shared component (then change that component's options instead).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
