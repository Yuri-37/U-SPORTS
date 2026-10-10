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
