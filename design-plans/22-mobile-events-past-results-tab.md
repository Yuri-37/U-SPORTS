# Android: the Events tab for finished events is called "Past results", like the Home link that opens it and the website

Written against: 11f5963

## Evidence chain

- Surface: Android app, Events tab (`/events`), the second tab of the tab bar. Home's Events section links to it.
- Problem: Home has a link "Past results →" that opens the Events screen on a tab labelled just "Past". The website names the same tab "Past results", and its hub uses the same link text.
- Design evidence (direct contradiction within the same task):
  - `mobile/lib/screens/events_screen.dart` ~L53: `BrandTabBar(controller: _tab, tabs: const ['Upcoming & live', 'Past'])`.
  - `mobile/lib/screens/home_screen.dart` ~L261: `SectionLink(label: 'Past results →', onTap: () => context.go('/events?view=past'))`. `events_screen.dart` ~L31-35 reads `view=past` and switches to that tab.
  - Shared web/mobile feature: `apps/web/src/pages/guest/Events.tsx` ~L157-163, tabs `'Upcoming & live'` and `'Past results'`; `apps/web/src/pages/guest/Hub.tsx` ~L468-471, link "Past results →".
- Owner: the tab labels in `events_screen.dart`.
- Scope and affected surfaces: one tab label.
- Uncertainty: none. The first tab already matches the web ("Upcoming & live").

## Design decision

The second tab reads "Past results", the words on the Home link and on the website. Which events it lists does not change.

## Reuse

- `BrandTabBar` (`mobile/lib/widgets/ui/brand_page.dart`), unchanged.
- Exemplar: `apps/web/src/pages/guest/Events.tsx` ~L157-163.

No new primitive is needed.

## Changes

1. `mobile/lib/screens/events_screen.dart` (~L53)
   - Change: `'Past'` -> `'Past results'`.
   - Preserve: tab order, the `view=past` / `tab=past` deep link handling, the sport chips and search.
   - Verify: Home -> "Past results →" opens Events with the "Past results" tab selected.

## Scope

- Inherit: the Events tab for guests and signed-in users.
- Verify: both tab labels fit the tab bar without truncation at 320dp, and no test looks for the old "Past" label (search `mobile/test`).
- Exclude: the event list content and the status pills.

## Validation

- Product: a visitor who taps "Past results" lands on a tab with that name, as on the website.
- Interface: Events at 320dp and 411dp widths in light and dark themes; open it from Home's link and from the bottom navigation.
- System: copy only.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the two labels no longer fit at 320dp (report it, rather than shortening the web wording on mobile alone).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
