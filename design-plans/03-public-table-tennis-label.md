# Public match cards and the match sheet name table tennis the way the rest of the page does

Written against: 11f5963

## Evidence chain

- Surface: the public guest hub `/guest` ("Live games" cards), the public match sheet (`PublicMatchDetailModal`, opened from an event's Matches tab at `/events/:id` and `/guest/events/:id`), and the jumbotron `/jumbotron/:matchId`.
- Problem: a live table tennis card on the hub ends with "0–0 games won · Table tennis", and the match sheet reads "Table tennis · Points per game". The same hub page names the sport "Table Tennis" in the "Browse by sport" tiles and in the footer's Sports column, so one page spells the sport two ways.
- Design evidence (direct contradiction on the same page):
  - `apps/web/src/lib/liveMatchPresentation.ts` `getSportPhrase()` (~L76-81) returns `'Table tennis'`; `liveScorePresentation()` puts it in the `subtitle` (e.g. ~L70: `` `${...}–${...} games won · ${getSportPhrase(sport)}` ``).
  - `apps/web/src/pages/guest/Hub.tsx` L257 renders `liveScorePresentation(...)` on each live card; the same page renders `SPORT_TILES` labels (`'Table Tennis'`, rendered at L541).
  - `apps/web/src/components/layout/GuestLayout.tsx` L241: footer link "Table Tennis", rendered on every public page.
  - `apps/web/src/components/events/PublicMatchDetailModal.tsx` ~L208: the literal `'Table tennis · Points per game'`.
- Owner: `getSportLabel` in `apps/web/src/lib/utils.ts` (`'table-tennis'` returns `'Table Tennis'`), the sport name used by sport tags, event cards and filters across the web app. `getSportPhrase` duplicates it with a different capitalization.
- Scope and affected surfaces: every caller of `liveScorePresentation` (`Hub.tsx`, `PublicMatchDetailModal.tsx`, `JumbotronPage.tsx`) and the modal's period-table caption.
- Uncertainty: none.

## Design decision

Public score text names the sport with `getSportLabel`, so it reads "Table Tennis" everywhere a visitor sees it, matching the hub tiles, the footer and the rest of the app. Basketball and Volleyball text does not change, because both helpers already agree on those.

## Reuse

- `getSportLabel` from `apps/web/src/lib/utils.ts`
- Exemplar: `apps/web/src/components/ui/SportIcon.tsx` (`SportTag` renders `getSportLabel(sport)`).

No new primitive is needed. `getSportPhrase` should not stay as a second source of sport names.

## Changes

1. `apps/web/src/lib/liveMatchPresentation.ts`
   - Change: `liveScorePresentation` builds its subtitles with `getSportLabel` instead of `getSportPhrase`, and `getSportPhrase` is removed. Keep a fallback to the raw slug for an unknown sport, because `getSportLabel` returns `undefined` for slugs outside `Sport`.
   - Preserve: every other part of each subtitle ("x–y games won", "x–y sets won", the period phase text) and the scores.
   - Verify: a live table tennis card reads "… games won · Table Tennis"; basketball and volleyball cards are unchanged.
2. `apps/web/src/components/events/PublicMatchDetailModal.tsx` (~L201-209, period-table caption)
   - Change: the table tennis caption reads "Table Tennis · Points per game", taken from `getSportLabel`.
   - Preserve: the basketball, volleyball and fallback captions.
   - Verify: opening a table tennis match from an event's Matches tab shows "Table Tennis · Points per game".

## Scope

- Inherit: the hub Live games cards, the public match sheet, and the jumbotron caption, which all render `liveScorePresentation`.
- Verify: the jumbotron at `/jumbotron/:matchId` for a table tennis match still fits its caption on one line at 1280px and 1920px.
- Exclude: the Android app (separate code), staff pages, and any change to scores or period logic.

## Validation

- Product: a visitor sees one consistent sport name across the hub, match cards and the match sheet.
- Interface: `/guest` with a live table tennis match (card footer), `/events/:id` Matches tab opening a table tennis match (sheet caption), and `/jumbotron/:matchId`; light and dark themes; 390px and 1280px widths.
- System: no remaining local sport-name map in `liveMatchPresentation.ts`.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `getSportLabel` no longer returns "Table Tennis" for `table-tennis`, or if `liveScorePresentation` has gained callers that need the lowercase phrase inside a sentence (then confirm the wording with the product owner first).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
