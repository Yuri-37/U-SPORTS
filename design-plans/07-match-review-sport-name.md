# Match Review and the Score Sheet name the sport properly ("Table Tennis", not "Table-tennis")

Written against: 11f5963

## Evidence chain

- Surface: staff match review, `/organizer/match-review/:id` (opened from an event's Matches tab), and its printable score sheet, `/organizer/match-review/:id/score-sheet`.
- Problem: both pages print the sport by title-casing its slug, so a table tennis match shows "Table-tennis", with a hyphen and a lowercase "t". The event page the reviewer just came from names the same sport "Table Tennis".
- Design evidence (direct contradiction within the same task):
  - `apps/web/src/pages/organizer/MatchReview.tsx` ~L328: `<p className="text-center text-xs text-[var(--text-muted)]">{formatEnumLabel(sport)}</p>` under "Final Score".
  - `apps/web/src/pages/organizer/ScoreSheet.tsx` ~L190-193: the "Sport" field renders `{formatEnumLabel(sport)}`.
  - `apps/web/src/lib/utils.ts` `formatEnumLabel` splits only on `_`, so `'table-tennis'` becomes "Table-tennis" (basketball and volleyball happen to come out right).
  - The event page that opens these screens, `apps/web/src/pages/organizer/EventDetail.tsx` ~L559, renders `{getSportLabel(event.sport as any)} · {formatEnumLabel(event.format)}`, which gives "Table Tennis · Single Elim".
- Owner: `getSportLabel` in `apps/web/src/lib/utils.ts` (`'table-tennis'` returns "Table Tennis").
- Scope and affected surfaces: the two sport labels above.
- Uncertainty: none.

## Design decision

Both pages name the sport with `getSportLabel`, the same owner the event page and the rest of the app use. `formatEnumLabel` stays for real underscore enums (format, status), and is no longer used for sport slugs here.

## Reuse

- `getSportLabel` from `apps/web/src/lib/utils.ts`
- Exemplar: `apps/web/src/pages/organizer/EventDetail.tsx` ~L559.

No new primitive is needed.

## Changes

1. `apps/web/src/pages/organizer/MatchReview.tsx` (~L328)
   - Change: render `getSportLabel(sport as Sport)` instead of `formatEnumLabel(sport)`; import `getSportLabel` (and the `Sport` type if needed). Keep a fallback to the raw value if `sport` is not a known slug.
   - Preserve: the Final Score card layout, sizes and colors.
   - Verify: a table tennis match shows "Table Tennis" under the final score.
2. `apps/web/src/pages/organizer/ScoreSheet.tsx` (~L190-193, "Sport" field)
   - Change: same, `getSportLabel` for the Sport value.
   - Preserve: the sheet's print layout and every other field.
   - Verify: the on-screen score sheet and its print preview read "Sport: Table Tennis".

## Scope

- Inherit: Match Review and the on-screen Score Sheet.
- Verify: basketball and volleyball matches still read "Basketball" and "Volleyball" in both places.
- Exclude: the server-generated PDF (`apps/server/src/routes/reports.ts`), which is a separate surface; and the `formatEnumLabel(insight...)` calls in Analytics, which format real enums.

## Validation

- Product: a reviewer sees the same sport name on the event page, the review page and the score sheet.
- Interface: open a completed table tennis match from an event's Matches tab -> Match Review -> Score Sheet; also one basketball match. Light and dark themes; print preview of the score sheet.
- System: sport names on these pages come from `getSportLabel`.
- Repository: `cd apps/web && npx tsc --noEmit -p .` -> exits 0 with no output.

## Stop conditions

- Stop if `sport` on either page is no longer the slug (for example already a display label), or if `getSportLabel` changes its strings.

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
