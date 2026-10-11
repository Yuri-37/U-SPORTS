# Android: a finished event's standings sit under a "Final rankings" heading, like the website

Written against: 11f5963

## Evidence chain

- Surface: Android app, event detail (`/events/:id`) for a finished event. The standings (Champion, Runner-up, then numbered places) appear between the description and the Bracket / Matches tabs.
- Problem: the standings appear as an untitled list, so a visitor sees team names with "Champion" and "Runner-up" under them but no label for the block. The website shows the same standings in a block titled "Final rankings". The app's own code says this block mirrors the web one.
- Design evidence:
  - `mobile/lib/screens/event_detail_screen.dart` ~L383-402: `if (standings != null && status == 'completed') Padding(... child: SheetGroup(children: [_PodiumRow..., _StandingsRow...]))`, with no heading.
  - Same file ~L536-537, on `_StandingsRow`: "a numbered row rather than the trophy/medal treatment above (mirrors web's EventPodiumStrip split)".
  - Web: `apps/web/src/pages/EventDetailPage.tsx` ~L239-246 renders `<EventPodiumStrip ... title="Final rankings" />` under the same condition (`event.status === 'completed'` with standings). `apps/web/src/components/events/EventPodiumStrip.tsx` ~L45-47 prints that title above the rows.
- Owner: the standings block in `event_detail_screen.dart`.
- Scope and affected surfaces: one heading above the standings.
- Uncertainty: none for the wording. The spacing reuses an existing in-app pattern (see Reuse).

## Design decision

Put `SectionHeader(title: 'Final rankings', padding: EdgeInsets.only(bottom: 12))` directly above the standings `SheetGroup`, inside the existing padded block. It uses the same wording as the web and the app's standard section heading. Rows, icons and taps stay unchanged.

## Reuse

- `SectionHeader` (`mobile/lib/widgets/ui/brand_page.dart`).
- Exemplar for the compact top spacing: `mobile/lib/screens/athlete/athlete_dashboard_screen.dart` ~L408, `SectionHeader(title: 'Season snapshot', padding: EdgeInsets.only(bottom: 12))`.
- Web wording: `apps/web/src/pages/EventDetailPage.tsx` ~L245.

No new primitive is needed.

## Changes

1. `mobile/lib/screens/event_detail_screen.dart` (~L383-402)
   - Change: wrap the standings in a `Column` (`crossAxisAlignment: CrossAxisAlignment.stretch`) whose first child is `const SectionHeader(title: 'Final rankings', padding: EdgeInsets.only(bottom: 12))`, followed by the existing `SheetGroup`.
   - Preserve: the outer padding (`fromLTRB(16, 16, 16, 0)`), `_PodiumRow` / `_StandingsRow`, their tap handlers, and the condition that shows the block.
   - Verify: a finished event shows "Final rankings" above Champion, Runner-up and the numbered places; ongoing events show no heading and no block.

## Scope

- Inherit: event detail for every finished event, from Events, Home champions, team pages and the athlete dashboard.
- Verify: with a long standings list the Bracket / Matches area still has usable height at 320dp × 640dp. If it does not, stop (see Stop conditions).
- Exclude: the standings data, the podium icons, and the web page.

## Validation

- Product: a visitor knows the list at the top of a finished event is its final ranking, the same as on the website.
- Interface: a finished single-elimination event with 2 and with 8 teams; an ongoing event; light and dark themes; 320dp and 411dp widths.
- System: standard `SectionHeader`; no new styles.
- Repository: `cd mobile && flutter analyze` -> "No issues found!"; `cd mobile && flutter test` -> all tests pass.

## Stop conditions

- Stop if the extra heading pushes the tab area below a usable height on a small phone. The fix then is the standings layout itself, a separate decision.
- Stop if the web title changes (follow it).

## Design documentation

- After acceptance and validation: none (no design documentation exists in the repository).
