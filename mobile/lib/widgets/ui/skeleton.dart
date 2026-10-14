import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import 'brand_page.dart';

/// Placeholders shaped like the real cards and rows, shown while data loads so
/// the screen keeps its layout instead of showing a lone spinner. Everything
/// inside one [SkeletonGroup] pulses together; with Remove animations on, or
/// outside a group, the shapes simply sit still.
class SkeletonGroup extends StatefulWidget {
  const SkeletonGroup({super.key, required this.child});

  final Widget child;

  @override
  State<SkeletonGroup> createState() => _SkeletonGroupState();
}

class _SkeletonGroupState extends State<SkeletonGroup> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _pulse.stop();
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SkeletonPulse(animation: _pulse, child: Semantics(label: 'Loading', child: widget.child));
  }
}

class _SkeletonPulse extends InheritedWidget {
  const _SkeletonPulse({required this.animation, required super.child});

  final Animation<double> animation;

  @override
  bool updateShouldNotify(_SkeletonPulse old) => old.animation != animation;
}

/// One grey shape. Soft pulse between two greys, in step with its group.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = 8});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = dark ? const Color(0xFF22222E) : const Color(0xFFE3E8F0);
    final glow = dark ? const Color(0xFF2D2D3C) : const Color(0xFFEDF1F7);
    final pulse = context.dependOnInheritedWidgetOfExactType<_SkeletonPulse>()?.animation;
    Widget shape(Color c) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(radius)),
        );
    if (pulse == null || MediaQuery.disableAnimationsOf(context)) return shape(base);
    return AnimatedBuilder(
      animation: pulse,
      builder: (context, _) => shape(Color.lerp(base, glow, Curves.easeInOut.transform(pulse.value))!),
    );
  }
}

/// The white rounded surface the real cards sit on.
class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard({required this.child, this.padding = const EdgeInsets.all(14)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).brightness;
    return Container(
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.cardShadow(b),
        border: b == Brightness.dark ? Border.all(color: LayoutTokens.borderSubtle(context)) : null,
      ),
      padding: padding,
      child: child,
    );
  }
}

/// An event card while it loads: sport tile, two title lines, a status pill.
class EventCardSkeleton extends StatelessWidget {
  const EventCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const _SkeletonCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SkeletonBox(width: 44, height: 44, radius: 14),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(height: 15),
                SizedBox(height: 7),
                SkeletonBox(width: 150, height: 15),
                SizedBox(height: 10),
                SkeletonBox(width: 110, height: 12),
              ],
            ),
          ),
          SizedBox(width: 10),
          SkeletonBox(width: 66, height: 24, radius: 12),
        ],
      ),
    );
  }
}

/// A live-match card while it loads: status row, two team names around a score, footer.
class LiveMatchCardSkeleton extends StatelessWidget {
  const LiveMatchCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const SkeletonGroup(
      child: _SkeletonCard(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          children: [
            Row(
              children: [
                SkeletonBox(width: 58, height: 24, radius: 12),
                SizedBox(width: 10),
                SkeletonBox(width: 90, height: 14),
                Spacer(),
                SkeletonBox(width: 110, height: 12),
              ],
            ),
            SizedBox(height: 18),
            Row(
              children: [
                SkeletonBox(width: 90, height: 16),
                Spacer(),
                SkeletonBox(width: 28, height: 30),
                SizedBox(width: 14),
                SkeletonBox(width: 28, height: 30),
                Spacer(),
                SkeletonBox(width: 90, height: 16),
              ],
            ),
            SizedBox(height: 18),
            SkeletonBox(height: 12),
          ],
        ),
      ),
    );
  }
}

/// A column of event-card placeholders.
class EventCardListSkeleton extends StatelessWidget {
  const EventCardListSkeleton({super.key, this.count = 4, this.gap = 10});

  final int count;
  final double gap;

  @override
  Widget build(BuildContext context) {
    return SkeletonGroup(
      child: Column(
        children: [
          for (var i = 0; i < count; i++) ...[
            if (i > 0) SizedBox(height: gap),
            const EventCardSkeleton(),
          ],
        ],
      ),
    );
  }
}

/// A group of list rows while it loads: a tile, a title and subtitle, a trailing value.
class SheetRowsSkeleton extends StatelessWidget {
  const SheetRowsSkeleton({super.key, this.count = 4});

  final int count;

  @override
  Widget build(BuildContext context) {
    return SkeletonGroup(
      child: SheetGroup(
        children: [
          for (var i = 0; i < count; i++)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  SkeletonBox(width: 40, height: 40, radius: 13),
                  SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SkeletonBox(width: 170, height: 15),
                        SizedBox(height: 7),
                        SkeletonBox(width: 110, height: 12),
                      ],
                    ),
                  ),
                  SizedBox(width: 10),
                  SkeletonBox(width: 54, height: 16),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The leaderboard table while it loads: a header line and rows of cells.
class TableSkeleton extends StatelessWidget {
  const TableSkeleton({super.key, this.rows = 8});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return SkeletonGroup(
      child: SheetGroup(
        dividers: false,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 10),
            child: Row(
              children: [
                SkeletonBox(width: 18, height: 11),
                SizedBox(width: 22),
                SkeletonBox(width: 80, height: 11),
                Spacer(),
                SkeletonBox(width: 30, height: 11),
                SizedBox(width: 22),
                SkeletonBox(width: 30, height: 11),
                SizedBox(width: 22),
                SkeletonBox(width: 30, height: 11),
              ],
            ),
          ),
          for (var i = 0; i < rows; i++)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  SkeletonBox(width: 18, height: 14),
                  SizedBox(width: 22),
                  SkeletonBox(width: 110, height: 14),
                  Spacer(),
                  SkeletonBox(width: 30, height: 14),
                  SizedBox(width: 22),
                  SkeletonBox(width: 30, height: 14),
                  SizedBox(width: 22),
                  SkeletonBox(width: 30, height: 14),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
