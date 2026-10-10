import 'package:flutter/animation.dart';

/// Shared motion values. Mirrors the web token
/// `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`.
abstract final class AppMotion {
  /// Strong ease-out for entrances and feedback.
  static const Curve easeOutStrong = Cubic(0.23, 1, 0.32, 1);

  /// A live score ticking over: quick enough to read as feedback, never a show.
  static const Duration scoreChange = Duration(milliseconds: 200);
}
