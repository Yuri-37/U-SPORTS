import 'package:flutter/material.dart';

import '../../theme/motion.dart';

/// The tab pages, all kept alive like an IndexedStack, but switching tabs fades
/// the old page out while the new one fades in and slides a little in from the
/// side the tab is on, instead of swapping instantly. With Remove animations on
/// it swaps instantly.
class BranchFader extends StatefulWidget {
  const BranchFader({super.key, required this.currentIndex, required this.children});

  final int currentIndex;
  final List<Widget> children;

  @override
  State<BranchFader> createState() => _BranchFaderState();
}

class _BranchFaderState extends State<BranchFader> with SingleTickerProviderStateMixin {
  static const double _slide = 28;

  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 300), value: 1);
  late int _from = widget.currentIndex;
  late int _to = widget.currentIndex;

  /// The last two tab slots share branches 3 and 4 (athlete / coach).
  static int _slotOf(int branch) => branch >= 3 ? 3 : branch;

  @override
  void didUpdateWidget(covariant BranchFader old) {
    super.didUpdateWidget(old);
    if (widget.currentIndex == _to) return;
    _from = _to;
    _to = widget.currentIndex;
    if (MediaQuery.disableAnimationsOf(context) || _slotOf(_from) == _slotOf(_to)) {
      _controller.value = 1;
    } else {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = AppMotion.easeOutStrong.transform(_controller.value);
        final animating = _controller.value < 1;
        final dir = _slotOf(_to) >= _slotOf(_from) ? 1.0 : -1.0;
        return Stack(
          fit: StackFit.expand,
          children: [
            for (var i = 0; i < widget.children.length; i++)
              _page(i, t, animating, dir),
          ],
        );
      },
    );
  }

  Widget _page(int i, double t, bool animating, double dir) {
    final active = i == _to;
    final leaving = animating && i == _from;
    final visible = active || leaving;
    Widget child = widget.children[i];
    if (animating && active) {
      child = Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(dir * _slide * (1 - t), 0), child: child),
      );
    } else if (leaving) {
      child = Opacity(
        opacity: 1 - t,
        child: Transform.translate(offset: Offset(-dir * _slide * t, 0), child: child),
      );
    }
    return Offstage(
      offstage: !visible,
      child: TickerMode(
        enabled: visible,
        child: IgnorePointer(ignoring: !active, child: child),
      ),
    );
  }
}
