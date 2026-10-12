import 'package:flutter/animation.dart';

/// Shared motion values. Mirrors the web token
/// `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`.
abstract final class AppMotion {
  /// Strong ease-out for entrances and feedback.
  static const Curve easeOutStrong = Cubic(0.23, 1, 0.32, 1);

  /// A live score ticking over: quick enough to read as feedback, never a show.
  static const Duration scoreChange = Duration(milliseconds: 200);

  // Scroll reveal. Mirrors apps/web/src/lib/scrollReveal.ts and the
  // [data-reveal] rules in apps/web/src/styles/index.css. Deliberately
  // dramatic. Fade, slide and scale only: no blur, which is costly in Flutter.

  /// Ease-out with a small overshoot, so a revealed item settles like a spring.
  /// Same curve as the web token --ease-spring.
  static const Curve spring = Cubic(0.34, 1.56, 0.64, 1);

  /// How long the move (rise, slide, scale) takes. The fade finishes sooner,
  /// because opacity cannot overshoot.
  static const Duration revealCard = Duration(milliseconds: 800);
  static const Duration revealRow = Duration(milliseconds: 700);
  static const Duration revealHeading = Duration(milliseconds: 700);
  static const Duration revealCardFade = Duration(milliseconds: 550);
  static const Duration revealRowFade = Duration(milliseconds: 450);

  /// A card rises this far, starting at [revealCardStartScale] of its size.
  static const double revealCardDistance = 70;
  static const double revealCardStartScale = 0.85;

  /// A row slides in from the side, alternating left and right.
  static const double revealRowDistance = 48;
  static const double revealRowStartScale = 0.94;

  /// A section heading slides in from the left.
  static const double revealHeadingDistance = 40;

  /// Gap between items that come into view together, and the longest any waits.
  /// With the longest move (800ms) the last item of a batch has landed by 1.2s.
  static const Duration revealStep = Duration(milliseconds: 100);
  static const Duration revealMaxDelay = Duration(milliseconds: 400);

  /// How far above the bottom of the screen an item must be before it reveals.
  static const double revealInset = 48;

  /// A stat number counting up to its value.
  static const Duration countUp = Duration(milliseconds: 1400);
}
