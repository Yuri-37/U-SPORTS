# Android: name the sport "Table Tennis", the same as the web app

Written against: 11f5963

## Evidence chain

- Surface: Android app screens that name a sport: Events sport chips, event cards and the event detail subtitle, the hub "Live now" cards, sport and athlete screens, and the athlete dashboard.
- Problem: the app names the sport "Table tennis" everywhere, while the website names the same sport "Table Tennis" on the same features (event cards, sport tabs, filters, sport tags). The user requires shared features to look the same on both clients.
- Design evidence:
  - Requirement: shared features must keep the same look and behavior as the web app (the audit request). The app's theme states the same intent: `mobile/lib/theme/layout_tokens.dart` L3-5, "values mirror web's CSS custom properties ... exactly, so the two clients read as the same product."
  - Web owner: `getSportLabel` in `apps/web/src/lib/utils.ts` returns `'Table Tennis'`. It is used by the web event cards, sport tags (`SportTag`), team cards and athlete rows. Two web spots that still say "Table tennis" are covered by `design-plans/01-sport-filter-labels-match-row-labels.md` and `design-plans/03-public-table-tennis-label.md`.
  - App owners: `mobile/lib/utils/sport_helpers.dart` `sportLabel()` L11-12 returns `'Table tennis'`, with 21 call sites across screens. `mobile/lib/utils/live_match_presentation.dart` `_sportPhrase()` ~L45-50 duplicates that map, also `'Table tennis'`, and feeds the live card subtitles (`liveScorePresentation`).
- Owner: `sportLabel` in `mobile/lib/utils/sport_helpers.dart`.
- Scope and affected surfaces: every `sportLabel(...)` call site and every `liveScorePresentation` subtitle.
- Uncertainty: none for the spelling. The fallback branch (`default:` title-cases a slug) is unchanged.

## Design decision

The app's single sport-name owner returns "Table Tennis", and the live presentation helper uses that owner instead of its own copy. A visitor sees the same sport name on the phone as on the website.

## Reuse

- `sportLabel` (`mobile/lib/utils/sport_helpers.dart`)
- Exemplar: the web owner `getSportLabel` (`apps/web/src/lib/utils.ts`) for the exact strings: "Basketball", "Volleyball", "Table Tennis".

No new primitive is needed. `_sportPhrase` should not remain as a second map.

## Changes

1. `mobile/lib/utils/sport_helpers.dart` (`sportLabel`, L11-12)
   - Change: `'table-tennis'` returns `'Table Tennis'`.
   - Preserve: the Basketball and Volleyball labels and the `default:` title-case fallback.
   - Verify: the Events chips, event cards and sport screen title read "Table Tennis".
2. `mobile/lib/utils/live_match_presentation.dart` (`_sportPhrase`, ~L45-50, and its uses in `liveScorePresentation`)
   - Change: remove `_sportPhrase` and build the subtitles with `sportLabel` (import `sport_helpers.dart`).
   - Preserve: the rest of each subtitle ("Game total", "x–y sets won", "x–y games won") and all score logic.
   - Verify: a live table tennis card on Home ends with "· Table Tennis".

## Scope

- Inherit: all 21 `sportLabel` call sites and the hub live cards.
- Verify: no layout overflow where the label sits in a tight row, such as the Events sport chips (the chip row scrolls horizontally) and the event detail subtitle ("Table Tennis · Single Elim") at 320dp width.
- Exclude: code comments that mention "Table tennis", the web app (handled by plans 01 and 03), and the coach position lists (table tennis has none).

## Validation

- Product: a visitor comparing the phone and the website sees the same sport name for the same events.
- Interface: Home (Live now card for a table tennis match), Events (sport chips, a table tennis event card), event detail header, the table tennis sport screen; light and dark themes; 320dp and 411dp widths.
- System: one sport-name map in the app (`sportLabel`); no duplicate in `live_match_presentation.dart`.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the web owner `getSportLabel` no longer returns "Table Tennis" (follow whatever the web uses instead), or if a test or screen depends on the lowercase "Table tennis" text (update it as part of this change rather than keeping two spellings).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
