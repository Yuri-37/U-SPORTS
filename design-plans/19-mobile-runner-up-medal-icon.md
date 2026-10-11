# Android: the Runner-up badge on the athlete dashboard uses the same medal as the event podium

Written against: 11f5963

## Evidence chain

- Surface: Android app, athlete Dashboard -> "Match history". A past match from an event where the athlete's team reached the final carries a Champion or Runner-up badge.
- Problem: the Runner-up badge uses a ribbon icon (`Icons.workspace_premium_rounded`). The event podium the athlete reaches by tapping that same row uses a medal icon (`Icons.military_tech_rounded`) for Runner-up. The badge's own code comment says it matches the podium, but it does not. On the web, both views use a medal for Runner-up.
- Design evidence:
  - `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` `_PlacementBadge` (~L614-640). Comment at ~L618: "Gold/silver medal convention — matches the podium card on the event detail screen." Icon at ~L630: `isChampion ? Icons.emoji_events_rounded : Icons.workspace_premium_rounded`.
  - `mobile/lib/screens/event_detail_screen.dart` `_PodiumRow` (~L519-523): `icon: isChampion ? Icons.emoji_events_rounded : Icons.military_tech_rounded`.
  - Runtime: `_pastMatchRow` (~L501-512) renders `_PlacementBadge` as the trailing widget and opens `/events/$evId`, where `_PodiumRow` renders.
  - Web counterpart of the same feature: `apps/web/src/pages/athlete/Dashboard.tsx` ~L933-937 (`Trophy` / `Medal`) and `apps/web/src/components/events/EventPodiumStrip.tsx` ~L70 (`Medal` for Runner-up).
- Owner: `_PodiumRow` in `event_detail_screen.dart`, the screen the badge comment names.
- Scope and affected surfaces: the Runner-up icon in `_PlacementBadge`.
- Uncertainty: none.

## Design decision

`_PlacementBadge` uses `Icons.military_tech_rounded` for Runner-up, the icon of the podium it claims to match. Champion, colors, sizes and text stay unchanged.

## Reuse

- `Icons.military_tech_rounded`, as used by `_PodiumRow`.
- Exemplar: `mobile/lib/screens/event_detail_screen.dart` ~L523.

No new primitive is needed.

## Changes

1. `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` (`_PlacementBadge`, ~L630)
   - Change: `Icons.workspace_premium_rounded` -> `Icons.military_tech_rounded`.
   - Preserve: the Champion icon, `LayoutTokens.warning` / `mutedText` colors, the 11pt icon size, padding, radius and the "Champion" / "Runner-up" text.
   - Verify: a Runner-up row in Match history shows the same medal as the Runner-up line on that event's podium.

## Scope

- Inherit: Match history rows on the athlete dashboard.
- Verify: the event detail podium is unchanged.
- Exclude: the web app (already uses a medal) and the placement logic.

## Validation

- Product: an athlete sees the same Runner-up symbol on their dashboard and on the event page it opens.
- Interface: athlete dashboard with one Champion and one Runner-up finish; tap the Runner-up row and compare the podium; light and dark themes; 320dp and 411dp widths.
- System: one Runner-up icon across the app.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the event podium's Runner-up icon has changed (follow the podium).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
