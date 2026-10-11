# Android: the Home "Browse by sport" heading uses sentence case like the other Home sections and the web hub

Written against: 11f5963

## Evidence chain

- Surface: Android app, Home (the guest hub, also the first screen for signed-in users).
- Problem: the section headings on Home read "Recent champions", "Live now", "Events" and then "Browse by Sport", the only one with a capitalized second word. The web hub names the same section "Browse by sport".
- Design evidence (direct contradiction on the same screen):
  - `mobile/lib/screens/home_screen.dart` ~L294: `const SectionHeader(title: 'Browse by Sport')`.
  - Same file: `SectionHeader(title: 'Recent champions', ...)` ~L193, `title: 'Live now'` ~L227, `title: 'Events'` ~L255.
  - Shared web/mobile feature: `apps/web/src/pages/guest/Hub.tsx` ~L509, `<SectionHeading label="Competitions" title="Browse by sport" />`.
- Owner: the `SectionHeader` title on `home_screen.dart`.
- Scope and affected surfaces: one heading.
- Uncertainty: none.

## Design decision

The heading reads "Browse by sport", matching the other Home headings and the web hub.

## Reuse

- `SectionHeader` (`mobile/lib/widgets/ui/brand_page.dart`), unchanged.
- Exemplar: `apps/web/src/pages/guest/Hub.tsx` ~L509.

No new primitive is needed.

## Changes

1. `mobile/lib/screens/home_screen.dart` (~L294)
   - Change: `'Browse by Sport'` -> `'Browse by sport'`.
   - Preserve: the three sport cards and their layout.
   - Verify: Home shows "Browse by sport" above the Basketball / Volleyball / Table Tennis cards.

## Scope

- Inherit: Home for guests and signed-in users.
- Verify: no test looks up the old text (search `mobile/test` for "Browse by Sport" and update any match).
- Exclude: sport names inside the cards (covered by `design-plans/06-mobile-table-tennis-label-matches-web.md`).

## Validation

- Product: Home's section names read consistently, the same as the website.
- Interface: Home in light and dark themes at 320dp and 411dp widths.
- System: copy only.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the web hub heading changes (follow it).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
