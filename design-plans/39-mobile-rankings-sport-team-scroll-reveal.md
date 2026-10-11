# 39 — Android: Rankings, sport and team screens reveal on scroll

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: 3 files, about 20 changed lines
- **Depends on**: plan 37
- **Web counterpart**: plan 36 (Leaderboards)

## Problem

The Rankings tab, the sport screen (`/sports/:sport`) and the team screen show everything at once. The web Leaderboards (plan 36) reveal the stats table as one block and team rankings row by row. The app should do the same.

## Target

| Screen | Content | Reveal |
| --- | --- | --- |
| Rankings | Player stats `SheetGroup` (holds a `DataTable`) | `Reveal`, card, the whole table as one block (web: table container) |
| Rankings | Team rankings rows | `SheetGroup(revealRows: true)`, row (web: team ranking cards) |
| Sport screen, Standings tab | Player stats `SheetGroup` | `Reveal`, card |
| Sport screen, Standings tab | Team rows | `SheetGroup(revealRows: true)`, row |
| Sport screen, Events tab | `EventCard`s | `Reveal(id: eventId)`, card (same as the Events tab) |
| Team screen | Roster rows | `SheetGroup(revealRows: true)`, row |
| Team screen | Matches rows | `SheetGroup(revealRows: true)`, row |

Why the player table is one block: `DataRow` is not a widget, so its rows cannot be animated one by one. Web plan 36 reveals its table as one block for the same reason, so both platforms match.

**Not animated**:
- The heroes, including the team screen's `FrostedCard` stats.
- The sport, season and search controls.
- The players/teams toggle chips.
- The tab bars.
- The "Coaches" chips.
- Loading indicators and `SheetMessage`s.

Changing sport, season or tab, or typing a search, comes after a touch, so the content on screen shows at once (plan 37). The table `Reveal` stays in place while its rows change, so it never replays within a visit.

The web team page (`pages/guest/TeamDetail.tsx`) was outside the requested web scope (hub, leaderboards, event pages). If it is added later, it should use `reveal.row` for roster and match rows, to match this plan.

## Steps

### `mobile/lib/screens/leaderboard_screen.dart`

1. Add the import `import '../widgets/ui/reveal.dart';`.
2. In `build` (lines 339-340), wrap the `BrandPage.fixed(...)` that is `DoubleBackToExit`'s `child:` in `RevealScope(child: ...)`.
3. Players (line 248): change `Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), child: SheetGroup(dividers: false, …))` so the group is wrapped: `child: Reveal(child: SheetGroup(dividers: false, …))`.
4. Teams (line 326): in `Padding(… child: SheetGroup(`, add `revealRows: true,` to that `SheetGroup`.

### `mobile/lib/screens/sport_detail_screen.dart`

5. Add the import `import '../widgets/ui/reveal.dart';`.
6. In `build` (line 64), change `return BrandPage.fixed(` to `return RevealScope(child: BrandPage.fixed(`, and close it.
7. Teams (line 143): change `SheetGroup(` to `SheetGroup(revealRows: true,`.
8. Players (line 163): wrap the `SheetGroup(dividers: false, …)` in `Reveal(child: …)`.
9. Events tab `itemBuilder` (line 264): `return Reveal(id: ev['id'], child: EventCard(event: ev, onTap: () => context.push('/events/${ev['id']}')));`

### `mobile/lib/screens/team_detail_screen.dart`

10. Add the import `import '../widgets/ui/reveal.dart';`.
11. In the data branch (line 210), change `return BrandPage.scroll(` to `return RevealScope(child: BrandPage.scroll(`, and close it. Leave the loading, error and not-found `BrandPage.fixed` branches alone.
12. Roster (line 238): change `SheetGroup(` to `SheetGroup(revealRows: true,`.
13. Matches (line 262): change `return SheetGroup(` to `return SheetGroup(revealRows: true,`.
14. Leave the coach roster edit sheet (`_rosterRow`'s edit action and `coach_roster_edit_sheet.dart`) alone. The team screen is public; the edit sheet is a coach tool and gets no motion.

## Boundaries

- Do NOT wrap individual `DataRow`s or restructure the `DataTable`.
- Do NOT add `RevealScope` to coach screens (`screens/coach/…`), even though coaches open the team screen too. The scope belongs to the public team screen only, which is what step 11 does.
- Do NOT release an APK as part of this plan.
- If a referenced `SheetGroup` or `ListView` has moved or changed shape, STOP and report.

## Verification

- **Mechanical**: `cd mobile && flutter analyze` is clean and `flutter test` passes.
- **Device check**:
  - **Rankings, first open.** The player table fades up 8px once loaded. Switch to Teams: the rows on screen show at once (the switch was a touch), and lower rows rise 4px as you scroll.
  - **Rankings, change sport.** The table updates in place; nothing replays.
  - **Home → Browse by sport → Basketball.** On the sport screen, standings appear with a short entrance. The Events tab: cards on screen show at once (the tab tap was a touch), and further cards reveal on scroll.
  - **A team with 12+ roster entries and matches.** Roster rows reveal top to bottom, and match rows reveal as they scroll in. Hairlines arrive with their rows.
  - **Sideways (720×1600).** The same. Short lists still finish fully visible at the bottom.
  - **Remove animations on.** Everything shows immediately.
- **Done when**: all three screens have a `RevealScope`, and the units in the Target table reveal as described.
