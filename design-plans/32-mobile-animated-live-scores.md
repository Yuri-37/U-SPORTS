# 32 — Android: live scores tick in when they change

- **Status**: TODO
- **Commit**: 1d47b4c
- **Severity**: MEDIUM (missed opportunity: state indication)
- **Category**: Missed opportunities (also Cohesion & tokens, Accessibility)
- **Estimated scope**: 2 new files, 3 edited files, about 70 lines

## Problem

Live scores in the app are polled every 2–2.5 seconds (`providers/hub_live_provider.dart:78`, `providers/events_api_provider.dart:180` and `:286`). When a point lands, the number is replaced in place with no transition. On a phone held at arm's length, a 9 turning into an 11 between polls is easy to miss. The scoreboard is the one place where "something just changed" is the whole point. The web jumbotron already flashes on a point; the app shows nothing.

The scores are plain `Text` widgets in three places:

```dart
// mobile/lib/widgets/live_match_card.dart:105 and :110 — current (Home "Live now" cards)
Text('${pres.left}', style: scoreStyle),
…
Text('${pres.right}', style: scoreStyle),
```

```dart
// mobile/lib/widgets/hub_live_match_sheet.dart:164 and :169 — current (the "Watch" sheet)
Text('${pres.left}', style: AppTheme.display(size: 32, color: LayoutTokens.primaryText(ctx))),
…
Text('${pres.right}', style: AppTheme.display(size: 32, color: LayoutTokens.primaryText(ctx))),
```

```dart
// mobile/lib/screens/event_detail_screen.dart:234-238 and :251-255 — current (event match sheet scoreboard)
Text('$totalA',
    style: AppTheme.display(
        size: 44,
        color: isCompleted && totalA > totalB ? LayoutTokens.success(context) : LayoutTokens.primaryText(context)),
    textAlign: TextAlign.center),
```

The app has no motion tokens: no shared curves or durations exist under `mobile/lib/theme/`.

## Target

A shared `AnimatedScore` widget. When the value changes, the new number fades in and rises from 25% of its own height (about 8px at 30pt) over 200ms, on the strong ease-out curve `Cubic(0.23, 1, 0.32, 1)`. The old number disappears at once, so the two values never overlap. It does not animate on first build. When the system "Remove animations" setting is on (`MediaQuery.disableAnimationsOf`), it swaps instantly.

```dart
// target — mobile/lib/theme/motion.dart (new)
import 'package:flutter/animation.dart';

/// Shared motion values. Mirrors the web token
/// `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`.
abstract final class AppMotion {
  /// Strong ease-out for entrances and feedback.
  static const Curve easeOutStrong = Cubic(0.23, 1, 0.32, 1);

  /// A live score ticking over: quick enough to read as feedback, never a show.
  static const Duration scoreChange = Duration(milliseconds: 200);
}
```

```dart
// target — mobile/lib/widgets/ui/animated_score.dart (new)
import 'package:flutter/material.dart';

import '../../theme/motion.dart';

/// A score that ticks in when its value changes: the new number fades and
/// rises a quarter of its height; the old one disappears at once so the two
/// never overlap. Static on first build and when animations are disabled.
class AnimatedScore extends StatelessWidget {
  const AnimatedScore({super.key, required this.value, required this.style, this.textAlign});

  final Object value;
  final TextStyle style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return AnimatedSwitcher(
      duration: reduce ? Duration.zero : AppMotion.scoreChange,
      switchInCurve: AppMotion.easeOutStrong,
      // Outgoing value vanishes immediately: no double-exposed digits.
      switchOutCurve: const Threshold(1.0),
      transitionBuilder: (child, animation) => FadeTransition(
        opacity: animation,
        child: SlideTransition(
          position: Tween<Offset>(begin: const Offset(0, 0.25), end: Offset.zero).animate(animation),
          child: child,
        ),
      ),
      child: Text('$value', key: ValueKey<Object>(value), style: style, textAlign: textAlign),
    );
  }
}
```

## Repo conventions to follow

- Theme files live in `mobile/lib/theme/` (`app_theme.dart`, `layout_tokens.dart`, with doc comments that cite the web values they mirror). `motion.dart` follows that style.
- Shared building blocks live in `mobile/lib/widgets/ui/` (`brand_page.dart`).
- Exemplar of an implicit animation already in the app: `mobile/lib/widgets/offline_banner.dart` (`AnimatedSlide`, 250ms).

## Steps

1. Create `mobile/lib/theme/motion.dart` with the `AppMotion` class exactly as in the target.
2. Create `mobile/lib/widgets/ui/animated_score.dart` with `AnimatedScore` exactly as in the target.
3. `mobile/lib/widgets/live_match_card.dart`: import `ui/animated_score.dart`. Replace `Text('${pres.left}', style: scoreStyle)` with `AnimatedScore(value: pres.left, style: scoreStyle)`, and do the same for `pres.right`.
4. `mobile/lib/widgets/hub_live_match_sheet.dart`: import `ui/animated_score.dart`. Replace the two score `Text` widgets (lines 164 and 169) with `AnimatedScore(value: pres.left, style: AppTheme.display(size: 32, color: LayoutTokens.primaryText(ctx)))` and the same for `pres.right`.
5. `mobile/lib/screens/event_detail_screen.dart`: import `../widgets/ui/animated_score.dart`. Replace the `Text('$totalA', …)` and `Text('$totalB', …)` widgets (lines 234-238 and 251-255) with `AnimatedScore(value: totalA, style: <the same AppTheme.display(...) expression>, textAlign: TextAlign.center)` and the same for `totalB`.
6. Add `mobile/test/animated_score_test.dart` with two widget tests:
   - First build: pump `AnimatedScore(value: 3, …)`. "3" shows, and the `FadeTransition` above it (`find.ancestor(of: find.text('3'), matching: find.byType(FadeTransition))`) already has `opacity.value == 1`. There is no entrance animation.
   - Change: re-pump with `value: 5`, then `pump(const Duration(milliseconds: 100))`. The `FadeTransition` above "3" has `opacity.value == 0` (the old value is hidden at once), and the one above "5" is between 0 and 1. After `pumpAndSettle`, `find.text('3')` finds nothing and `find.text('5')` finds one widget.

## Boundaries

- Do NOT animate period boxes, team names, the LIVE pill or anything other than the score numbers.
- Do NOT change polling intervals, score logic or text styles.
- Do NOT add packages.
- Do NOT add a scale or bounce. Keep exactly the fade plus 25% rise.
- If the cited lines differ from the excerpts, STOP and report instead of improvising.

## Verification

- **Mechanical**: `cd mobile && flutter analyze` prints "No issues found!", and `cd mobile && flutter test` reports all tests passed, including the two new ones.
- **Feel check** (emulator or phone, with a live match being scored from the web organizer screen):
  - Home → Live now: when a point lands, the new number lifts into place in about a fifth of a second. The old number never shows behind it.
  - Open the card's Watch sheet and an event match sheet. They behave the same.
  - Nothing animates when a screen first opens or when a poll returns the same score.
  - Android Settings → Accessibility → Remove animations: scores change instantly.
  - Use slow animations (`timeDilation = 5` in a debug run, or a screen recording stepped frame by frame) to confirm the rise is small (about 8px at 30pt) with no overshoot.
- **Done when**: all six score numbers use `AnimatedScore`, `AppMotion` exists, and the tests pass.
