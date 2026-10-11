# 38 — Android: Home, Events and the event screen reveal on scroll

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 3 files, about 25 changed lines
- **Depends on**: plan 37 (`RevealScope`, `Reveal`, `SheetGroup.revealRows`)
- **Web counterparts**: plan 34 (hub), plan 35 (Events list, event page)

## Problem

Home, the Events tab and the event screen show every card and row at once. Their web counterparts (plans 34 and 35) reveal as they scroll in. The two should match.

## Target

These are the same units and kinds as on the web:

| Screen | Content | Reveal |
| --- | --- | --- |
| Home | "Live now" `LiveMatchCard`s | `Reveal(id: matchId)`, card (web: hub Live games cards) |
| Home | "Events" `EventCard`s | `Reveal(id: eventId)`, card (web: hub Events cards) |
| Home | "Browse by sport" three cards | `Reveal`, card each, staggered left to right (web: sport tiles) |
| Home | "Recent champions" rows | `SheetGroup(revealRows: true)`, row (the app shows champions as rows in one group) |
| Events tab | `EventCard`s in both tabs | `Reveal(id: eventId)`, card (web: Events list cards) |
| Event screen | Matches tab rows | `SheetGroup(revealRows: true)`, row (web: Matches tab rows) |

**Not animated**, on either platform:
- The hero (school, stats, title).
- `SectionHeader`s.
- The update card, guest notice and banners. They sit at the top and carry their own state.
- The announcement ticker, which has its own motion.
- The location footer.
- The Events filters.
- The bracket (a zoomable diagram).
- "Final rankings".
- Loading indicators and `SheetMessage`s.

**Behaviour** follows plan 37's rules:
- On first open, the cards on screen cascade 40ms apart, and the rest reveal as they cross 48px above the floating navigation.
- Home lives in the shell's `IndexedStack`, so switching tabs and coming back never replays it.
- After the first touch, the following show instantly whatever is on screen:
  - pull-to-refresh,
  - a sport chip or search change on Events,
  - a tab swipe,
  - a live poll that adds a card.

## Steps

### `mobile/lib/screens/home_screen.dart`

1. Add the import `import '../widgets/ui/reveal.dart';`.
2. In `build` (lines 183-184), wrap the `BrandPage.scroll(...)` that is `DoubleBackToExit`'s `child:` in `RevealScope(child: ...)`.
3. In "Recent champions" (line 248), change `SheetGroup(` to `SheetGroup(revealRows: true,` and keep `children:` as is.
4. In "Live now" (lines 290-299), wrap the returned card:

   ```dart
   return Reveal(
     id: mid,
     child: LiveMatchCard(
       match: m,
       labels: snap.participantLabels,
       period: period,
       onWatch: () => showHubLiveMatchSheet(context, matchId: mid),
     ),
   );
   ```

5. In "Events" (lines 328-336), wrap each entry:

   ```dart
   for (final e in shown)
     Reveal(
       id: e['id'],
       child: Padding(
         padding: const EdgeInsets.only(bottom: 10),
         child: EventCard(
           hubCompact: true,
           event: e,
           onTap: () => context.push('/events/${e['id']}'),
         ),
       ),
     ),
   ```

6. In "Browse by sport" (lines 347-355), wrap each card: `Expanded(child: Reveal(child: _browseSportCard(context, 'basketball')))`, and the same for `'volleyball'` and `'table-tennis'`.

### `mobile/lib/screens/events_screen.dart`

7. Add the import `import '../widgets/ui/reveal.dart';`.
8. In `_EventsScreenState.build` (lines 113-114), wrap the `BrandPage.fixed(...)` that is `DoubleBackToExit`'s `child:` in `RevealScope(child: ...)`.
9. In `_EventsList` `itemBuilder` (about line 215), change the card to:

   ```dart
   final card = Reveal(
     id: ev['id'],
     child: EventCard(
       event: ev,
       onTap: () => context.push('/events/${ev['id']}'),
     ),
   );
   ```

   The `id` matters here: `ListView.separated` builds lazily, and the id stops a card from replaying after it is scrolled away and rebuilt. Leave `header` (the sideways filters) unwrapped.

### `mobile/lib/screens/event_detail_screen.dart`

10. Add the import `import '../widgets/ui/reveal.dart';`.
11. In the data branch, change `return BrandPage.fixed(` (line 360, the one with `bottom: BrandTabBar(...)`) to `return RevealScope(child: BrandPage.fixed(`, and close it. Leave the loading and error branches alone.
12. In the Matches tab (line 477), change `SheetGroup(` to `SheetGroup(revealRows: true,`.
13. Do not touch the Bracket tab, `TournamentBracketView`, the "Final rankings" `SheetGroup` or `_showMatchSheet`.

## Boundaries

- Do NOT add `RevealScope` to any other screen: not auth, settings, notifications, the athlete dashboard or coach screens.
- Do NOT wrap `SectionHeader`, `UpdateAvailableCard`, `GuestPrivacyNotice`, `_PrimaryBanner`, the announcement widgets or `_locationFooter`.
- Do NOT change `LiveMatchCard`, `EventCard` or `AnimatedScore`.
- Do NOT release an APK as part of this plan.
- If any excerpt's structure differs (for example "Live now" no longer maps to `LiveMatchCard`), STOP and report.

## Verification

- **Mechanical**: `cd mobile && flutter analyze` is clean and `flutter test` passes.
- **Device check**. Run a debug build on the emulator (portrait 1080×2400, then sideways 720×1600 at 320dpi):
  - **Home, cold start.** The event cards on screen fade up about 8px, 40ms apart. Scroll down: "Browse by sport" cards rise in left to right, and champion rows rise 4px one after another.
  - **Home after switching tabs.** Go to Events and back to Home. Nothing replays.
  - **Home pull-to-refresh.** The content reloads with no entrance.
  - **Events.** On first open the cards cascade. Tap "Past results" and change the sport chip: on-screen cards show at once. Fling to the bottom and back up: no card plays twice.
  - **Event screen with 15+ matches.** Open Matches. The rows on screen arrive 20ms apart, and the hairlines come in with their rows, never before them. During a live match, a score update replays nothing; only the score ticks (plan 32).
  - **Sideways.** The same behaviour. Nothing hides behind the arc navigation.
  - **Remove animations.** Run `adb shell settings put global animator_duration_scale 0`, or turn on Settings → Accessibility → Remove animations. Everything is visible immediately and nothing moves. Restore with `animator_duration_scale 1`.
- **Done when**: the three screens have a `RevealScope`, the units in the Target table reveal as described, and nothing outside it animates.
