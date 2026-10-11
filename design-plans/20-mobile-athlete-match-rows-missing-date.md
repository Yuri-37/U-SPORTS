# Android: athlete match rows say when a date is not set, the way the web dashboard does

Written against: 11f5963

## Evidence chain

- Surface: Android app, athlete Dashboard -> "Upcoming & live" and "Match history" rows.
- Problem: when a match has no scheduled time, the row ends with a bare dash, for example "vs Team · Scheduled · —". Bracket matches commonly have no time until an organizer sets one. The web athlete dashboard shows the same rows with words: "Date and time not set yet" for an upcoming match and "Date not recorded" for a past one.
- Design evidence:
  - `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` `_upcomingMatchRow` ~L485-486: subtitle `'vs ${_opponentLabel(m)} · ${matchStatusLabel(...)} · ${formatDateTime(m['scheduled_at'] as String?)}'`. `_pastMatchRow` ~L508: `'vs ${_opponentLabel(m)} · ${formatDateTime(m['scheduled_at'] as String?)}'`.
  - `mobile/lib/utils/format_helpers.dart` ~L48-49: `formatDateTime` returns `'—'` for a null or empty value.
  - Shared web/mobile feature, web wording: `apps/web/src/pages/athlete/Dashboard.tsx` ~L848-854 (upcoming: the date, or "Date and time not set yet" when the match is scheduled, nothing when it is live) and ~L946-950 (past: the date, or "Date not recorded").
- Owner: the two row builders in `athlete_dashboard_screen.dart`.
- Scope and affected surfaces: the date segment of those two subtitles.
- Uncertainty: none. Both strings come from the web exemplar.

## Design decision

The rows follow the web dashboard's rule for a missing date:
- Upcoming, `scheduled`: "Date and time not set yet".
- Upcoming, `live`: leave the date segment out.
- Past: "Date not recorded".

When a date exists, the rows show `formatDateTime` as now. `formatDateTime` itself is not changed, because other screens rely on its dash.

## Reuse

- `formatDateTime`, `matchStatusLabel` (`mobile/lib/utils/format_helpers.dart`), unchanged.
- `SheetTile` subtitle, unchanged.
- Exemplar: `apps/web/src/pages/athlete/Dashboard.tsx` ~L848-854 and ~L946-950.

No new primitive is needed.

## Changes

1. `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` (`_upcomingMatchRow`, ~L485-486)
   - Change: build the date segment from `scheduled_at`: the formatted date when present; "Date and time not set yet" when absent and the status is `scheduled`; omitted (no trailing " · ") when absent and the status is `live`.
   - Preserve: "vs opponent", the status label, the LIVE pill, the icon tint and the tap target.
   - Verify: an unscheduled bracket match reads "vs Team · Scheduled · Date and time not set yet".
2. `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` (`_pastMatchRow`, ~L508)
   - Change: the date segment is "Date not recorded" when `scheduled_at` is absent.
   - Preserve: the placement badge and the tap target.
   - Verify: a completed match with no time reads "vs Team · Date not recorded".

## Scope

- Inherit: the athlete dashboard on Android.
- Verify: rows with a time look exactly as before.
- Exclude: `formatDateTime`, the coach home rows, the notifications list and the web app.

## Validation

- Product: an athlete reads "not set yet" instead of a dash, the same as on the website.
- Interface: athlete dashboard with an unscheduled upcoming match, a live match without a time, a scheduled match with a time, and a past match without a time; light and dark themes; 320dp width, where the longer subtitle wraps.
- System: no change to shared formatters.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the web dashboard's wording changes (follow it), or if `formatDateTime` is changed to return something other than a dash for a missing value.

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
