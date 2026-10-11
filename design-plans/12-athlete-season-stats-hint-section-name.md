# The Season stats hint points to the section that actually exists ("Match history")

Written against: 11f5963

## Evidence chain

- Surface: athlete portal, `/athlete` (dashboard), the help line under "Season stats".
- Problem: the hint ends "Recent finished games also appear above under Recent results." There is no "Recent results" section on this page. The section above that lists finished games is titled "Match history".
- Design evidence (direct contradiction within the same page):
  - `apps/web/src/pages/athlete/Dashboard.tsx` ~L1192-1197: "...Recent finished games also appear above under Recent results."
  - Same file ~L876-878: the section heading is "Match history" (History icon), and it lists completed and cancelled matches.
  - The Android athlete dashboard uses the same heading for that section: `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` ~L435, `title: 'Match history'`.
- Owner: the hint copy in `Dashboard.tsx`.
- Scope and affected surfaces: that one sentence.
- Uncertainty: none.

## Design decision

The hint names the real section: "Recent finished games also appear above under Match history." The rest of the hint stays.

## Reuse

- The existing "Match history" heading in the same file.
- Exemplar: `apps/web/src/pages/athlete/Dashboard.tsx` ~L878.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/athlete/Dashboard.tsx` (~L1195-1196)
   - Change: "under Recent results." -> "under Match history."
   - Preserve: the rest of the sentence, the highlighted "Games Played" span, and the paragraph's classes.
   - Verify: the line under Season stats ends "...above under Match history."

## Scope

- Inherit: the athlete dashboard.
- Verify: the Match history heading still reads "Match history".
- Exclude: the coach "Recent results" section on mobile (`mobile/lib/screens/coach/coach_home_screen.dart`), a different screen that does have that heading.

## Validation

- Product: an athlete following the hint finds the section it names.
- Interface: `/athlete` with season stats present, on desktop (two columns, Match history in the left column) and at 390px (single column, Match history above Season stats).
- System: copy only.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if the Match history section is renamed or moved below Season stats (then the hint must follow the new name or position).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
