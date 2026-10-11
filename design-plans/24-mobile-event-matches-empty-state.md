# Android: an event with no matches says "No matches yet.", like the team page and the website

Written against: 11f5963

## Evidence chain

- Surface: Android app, event detail -> Matches tab, when the event has no matches (for example, before the organizer generates the bracket).
- Problem: the empty tab says "No matches scheduled." That reads as if matches exist but have no time yet, which is a different state the app shows elsewhere. The team page in the same app and the website's event page both say "No matches yet" for this state.
- Design evidence:
  - `mobile/lib/screens/event_detail_screen.dart` ~L438-443: `matches.isEmpty ? ListView(... children: const [SheetMessage(text: 'No matches scheduled.')])`. It appears only when the list is empty.
  - Same app: `mobile/lib/screens/team_detail_screen.dart` ~L261: `SheetMessage(text: 'No matches yet.')`.
  - Shared web/mobile feature: `apps/web/src/pages/EventDetailPage.tsx` ~L320-322, "No matches yet".
  - The neighbouring Bracket tab already uses the web's words: `event_detail_screen.dart` ~L415, "No bracket generated yet." (web `BracketView.tsx` ~L187).
- Owner: the Matches tab empty message in `event_detail_screen.dart`.
- Scope and affected surfaces: one message.
- Uncertainty: none.

## Design decision

The empty Matches tab says "No matches yet.", matching the team page, the website and the "...yet." wording of the Bracket tab next to it.

## Reuse

- `SheetMessage` (`mobile/lib/widgets/ui/brand_page.dart`), unchanged.
- Exemplar: `mobile/lib/screens/team_detail_screen.dart` ~L261.

No new primitive is needed.

## Changes

1. `mobile/lib/screens/event_detail_screen.dart` (~L442)
   - Change: `'No matches scheduled.'` -> `'No matches yet.'`.
   - Preserve: pull-to-refresh on the empty state and the populated list.
   - Verify: a new event without a bracket shows "No bracket generated yet." on Bracket and "No matches yet." on Matches.

## Scope

- Inherit: the Matches tab of every event.
- Verify: no test looks for the old text (search `mobile/test`).
- Exclude: the athlete dashboard's "No matches scheduled yet." (a different list, of the athlete's upcoming games) and the web app.

## Validation

- Product: an empty event reads the same on the phone and the website.
- Interface: an event in registration with no bracket; light and dark themes; 320dp width.
- System: copy only.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the web wording changes (follow it).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
