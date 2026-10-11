import 'package:flutter/animation.dart';

/// Shared motion values. Mirrors the web token
/// `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`.
abstract final class AppMotion {
  /// Strong ease-out for entrances and feedback.
  static const Curve easeOutStrong = Cubic(0.23, 1, 0.32, 1);

  /// A live score ticking over: quick enough to read as feedback, never a show.
  static const Duration scoreChange = Duration(milliseconds: 200);

  // Scroll reveal. Mirrors apps/web/src/lib/scrollReveal.ts and the
  // [data-reveal] rules in apps/web/src/styles/index.css.

  /// A card fading and rising into view.
  static const Duration revealCard = Duration(milliseconds: 300);

  /// A list row fading and rising into view: quicker and smaller than a card.
  static const Duration revealRow = Duration(milliseconds: 200);

  static const double revealCardDistance = 8;
  static const double revealRowDistance = 4;

  /// Gap between items that come into view together, and the longest any waits.
  static const Duration revealCardStep = Duration(milliseconds: 40);
  static const Duration revealRowStep = Duration(milliseconds: 20);
  static const Duration revealCardMaxDelay = Duration(milliseconds: 200);
  static const Duration revealRowMaxDelay = Duration(milliseconds: 120);

  /// How far above the bottom of the screen an item must be before it reveals.
  static const double revealInset = 48;
}
