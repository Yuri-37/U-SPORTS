import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import '../theme/motion.dart';
import '../theme/layout_tokens.dart';
import 'ui/app_sheet.dart';
import 'ui/brand_page.dart' show isCompactHeight;

/// Persistent bottom nav shell for the four tab branches (Home, Rankings,
/// Events, Profile). Each branch keeps its own Navigator/state via
/// [StatefulShellRoute.indexedStack] so switching tabs no longer rebuilds
/// the destination screen or refetches its data.
///
/// Held sideways there is no height for a bottom bar, so the four tabs become
/// a slim arc of round buttons floating at the left edge instead.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  /// The last tab is role-dependent: athletes get their dashboard (branch 3),
  /// coaches their teams (branch 4). Both sit behind one bottom-nav slot, so
  /// the displayed index and the branch index are not the same number.
  static int _branchFor(int displayIndex, String role) {
    if (displayIndex < 3) return displayIndex;
    return role == 'Coach' ? 4 : 3;
  }

  static int _displayFor(int branchIndex) => branchIndex >= 3 ? 3 : branchIndex;

  void _onTap(BuildContext context, int index, String role) {
    // Guests have no last branch to switch to — send them to login instead of
    // a dashboard they can't see.
    if (index == 3 && role != 'athlete' && role != 'Coach') {
      context.push('/auth/login');
      return;
    }
    final branch = _branchFor(index, role);
    navigationShell.goBranch(
      branch,
      initialLocation: branch == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(profileProvider).valueOrNull?.role ?? 'guest';

    // Each tab branch is a single route with nothing to pop internally, so a
    // system back press on Rankings/Events/Profile would otherwise fall
    // through to the OS and exit the app. Only let that happen from Home —
    // everywhere else, back should return to Home first, matching how the
    // bottom nav itself behaves.
    final compact = isCompactHeight(context);
    final selected = _displayFor(navigationShell.currentIndex);
    final profileLabel = switch (role) {
      'Coach' => 'My Teams',
      'guest' => 'Sign in',
      _ => 'Profile',
    };
    final profileIcon = role == 'Coach' ? Icons.groups_outlined : Icons.person_outline;
    final profileIconSelected = role == 'Coach' ? Icons.groups_rounded : Icons.person_rounded;

    return PopScope(
      canPop: navigationShell.currentIndex == 0,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        navigationShell.goBranch(0);
      },
      child: compact
          ? _sidewaysShell(context, role, selected, profileLabel, profileIcon, profileIconSelected)
          : _floatingShell(context, role, selected, profileLabel, profileIcon, profileIconSelected),
    );
  }

  /// The page fills the whole screen and the four round buttons float over its
  /// bottom edge with nothing behind them, so the content scrolls underneath.
  /// The pages are told to leave [_PillNav.clearance] free at the bottom (through
  /// the bottom padding they already respect) so their last row can scroll clear.
  Widget _floatingShell(
    BuildContext context,
    String role,
    int selected,
    String profileLabel,
    IconData profileIcon,
    IconData profileIconSelected,
  ) {
    final mq = MediaQuery.of(context);
    return Scaffold(
      body: _MinimizeOnScroll(
        page: MediaQuery(
          data: mq.copyWith(padding: mq.padding.copyWith(bottom: mq.padding.bottom + _PillNav.clearance)),
          child: navigationShell,
        ),
        navBuilder: (minimized) => _PillNav(
          items: [
            const _NavItem('Home', Icons.home_outlined, Icons.home_rounded),
            const _NavItem('Rankings', Icons.emoji_events_outlined, Icons.emoji_events_rounded),
            const _NavItem('Events', Icons.calendar_today_outlined, Icons.calendar_today_rounded),
            _NavItem(profileLabel, profileIcon, profileIconSelected),
          ],
          selected: selected,
          minimized: minimized,
          onSelect: (i) => _onTap(context, i, role),
        ),
      ),
    );
  }

  /// The page fills the whole screen; the round buttons float over a gutter at
  /// its left edge. The gutter is reserved by widening the left inset the
  /// pages already respect, so nothing slides underneath the buttons.
  Widget _sidewaysShell(
    BuildContext context,
    String role,
    int selected,
    String profileLabel,
    IconData profileIcon,
    IconData profileIconSelected,
  ) {
    final mq = MediaQuery.of(context);
    final items = [
      const _NavItem('Home', Icons.home_outlined, Icons.home_rounded),
      const _NavItem('Rankings', Icons.emoji_events_outlined, Icons.emoji_events_rounded),
      const _NavItem('Events', Icons.calendar_today_outlined, Icons.calendar_today_rounded),
      _NavItem(profileLabel, profileIcon, profileIconSelected),
    ];
    return Scaffold(
      body: Stack(
        children: [
          MediaQuery(
            data: mq.copyWith(
              padding: mq.padding.copyWith(left: mq.padding.left + _ArcNav.gutter),
            ),
            child: navigationShell,
          ),
          Positioned(
            left: mq.padding.left,
            top: 0,
            bottom: 0,
            width: _ArcNav.width,
            child: SafeArea(
              left: false,
              right: false,
              child: Center(
                child: _ArcNav(
                  items: items,
                  selected: selected,
                  onSelect: (i) => _onTap(context, i, role),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem {
  const _NavItem(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// Round buttons laid out on a gentle arc bulging toward the page, so the
/// column reads as one curved strip rather than a rigid bar.
class _ArcNav extends StatelessWidget {
  const _ArcNav({required this.items, required this.selected, required this.onSelect});

  final List<_NavItem> items;
  final int selected;
  final ValueChanged<int> onSelect;

  static const double _dot = 46;
  static const double _gap = 10;
  static const double _bulge = 9;
  static const double _edge = 6;

  /// Width of the strip itself.
  static const double width = _edge + _dot + _bulge + _edge;

  /// Room reserved in the page, a little more than the strip so the content
  /// never touches the curve.
  static const double gutter = width + 4;

  @override
  Widget build(BuildContext context) {
    final mid = (items.length - 1) / 2;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < items.length; i++)
          Padding(
            padding: EdgeInsets.only(
              top: i == 0 ? 0 : _gap,
              // 0 at both ends, full bulge in the middle.
              left: _edge + _bulge * (1 - _squared((i - mid) / (mid == 0 ? 1 : mid))),
            ),
            child: _ArcButton(
              item: items[i],
              selected: i == selected,
              onTap: () => onSelect(i),
            ),
          ),
      ],
    );
  }

  static double _squared(double v) => v * v;
}

class _ArcButton extends StatelessWidget {
  const _ArcButton({required this.item, required this.selected, required this.onTap});

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fill = selected ? AppTheme.schoolPrimary : LayoutTokens.cardBackground(context);
    final ring = selected ? Colors.white.withValues(alpha: 0.9) : LayoutTokens.borderSubtle(context);
    return Tooltip(
      message: item.label,
      child: Semantics(
        button: true,
        selected: selected,
        label: item.label,
        child: Material(
          color: fill,
          elevation: selected ? 5 : 2,
          shadowColor: Colors.black.withValues(alpha: 0.35),
          shape: CircleBorder(side: BorderSide(color: ring, width: selected ? 2 : 1)),
          animationDuration: const Duration(milliseconds: 160),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: SizedBox(
              width: _ArcNav._dot,
              height: _ArcNav._dot,
              child: Icon(
                selected ? item.selectedIcon : item.icon,
                size: 22,
                color: selected ? Colors.white : LayoutTokens.mutedText(context),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Slims the navigation while the page is scrolling and brings it back when the
/// scrolling stops, so the raised button never sits on top of the text you are
/// reading. Only vertical scrolling counts; with Remove animations on it never
/// minimises.
class _MinimizeOnScroll extends StatefulWidget {
  const _MinimizeOnScroll({required this.page, required this.navBuilder});

  final Widget page;
  final Widget Function(bool minimized) navBuilder;

  @override
  State<_MinimizeOnScroll> createState() => _MinimizeOnScrollState();
}

class _MinimizeOnScrollState extends State<_MinimizeOnScroll> {
  bool _minimized = false;
  Timer? _restore;

  void _set(bool v) {
    if (_minimized != v && mounted) setState(() => _minimized = v);
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.axis != Axis.vertical || MediaQuery.disableAnimationsOf(context)) return false;
    if (n is ScrollUpdateNotification && (n.scrollDelta ?? 0).abs() > 1) {
      _restore?.cancel();
      _set(true);
      // Safety net if the end notification never comes.
      _restore = Timer(const Duration(milliseconds: 700), () => _set(false));
    } else if (n is ScrollEndNotification) {
      _restore?.cancel();
      _restore = Timer(const Duration(milliseconds: 250), () => _set(false));
    }
    return false;
  }

  @override
  void dispose() {
    _restore?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        NotificationListener<ScrollNotification>(onNotification: _onScroll, child: widget.page),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: _SlideAwayWhenCovered(
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: widget.navBuilder(_minimized),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// How far a page that covers the tabs (the login page) has risen, 0 to 1. The
/// page reports it through [NavCoverReporter]; the navigation reads it to slide
/// itself away. (A page route with a custom transition does not drive the
/// route underneath it, so this carries the value across.)
final ValueNotifier<double> navCover = ValueNotifier<double>(0);

/// Put around a page that slides over the tabs: feeds its transition progress
/// into [navCover] while it animates, and resets it when the page is gone.
class NavCoverReporter extends StatefulWidget {
  const NavCoverReporter({super.key, required this.animation, required this.child});

  final Animation<double> animation;
  final Widget child;

  @override
  State<NavCoverReporter> createState() => _NavCoverReporterState();
}

class _NavCoverReporterState extends State<NavCoverReporter> {
  void _report() => navCover.value = widget.animation.value;

  @override
  void initState() {
    super.initState();
    widget.animation.addListener(_report);
  }

  @override
  void dispose() {
    widget.animation.removeListener(_report);
    // Not during this frame's build: the navigation listens to this value.
    WidgetsBinding.instance.addPostFrameCallback((_) => navCover.value = 0);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Slides the navigation down and out of the way while the login page is rising
/// over the tabs, or while a bottom sheet is open, and back again afterwards.
class _SlideAwayWhenCovered extends StatelessWidget {
  const _SlideAwayWhenCovered({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return ValueListenableBuilder<double>(
      valueListenable: navCover,
      child: child,
      builder: (context, covered, child) => ValueListenableBuilder<int>(
        valueListenable: openSheets,
        builder: (context, sheets, _) => TweenAnimationBuilder<double>(
          tween: Tween<double>(end: sheets > 0 ? 1 : 0),
          duration: reduce ? Duration.zero : const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          builder: (context, sheetOut, _) => Transform.translate(
            offset: Offset(0, math.max(covered, sheetOut) * (_PillNav.height + 60)),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// The portrait navigation: a rounded bar with a raised round button for the
/// page you are on, sitting in a notch cut into the bar. Tapping another tab
/// slides the button (and its notch) across with a spring, leaning into the
/// move and swinging back upright as it lands. Labels sit under the icons.
///
/// While the page scrolls the bar slims down and the button sinks into it
/// ([minimized]), so nothing sticks up over the text.
class _PillNav extends StatelessWidget {
  const _PillNav({required this.items, required this.selected, required this.onSelect, required this.minimized});

  final List<_NavItem> items;
  final int selected;
  final ValueChanged<int> onSelect;
  final bool minimized;

  static const double barHeight = 64;
  static const double barHeightMin = 44;

  /// How far the raised button rises above the top of the bar.
  static const double lift = 12;
  static const double bubble = 44;
  static const double bubbleMin = 32;

  /// Total height the navigation reserves (bar plus the raised button).
  static const double height = lift + barHeight;

  /// Room the bar takes at the bottom of the screen (its height, the padding
  /// around it and a gap), beyond the system inset.
  static const double clearance = height + 10 + 6;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final navy = AppTheme.schoolPrimary;
    final barColor = LayoutTokens.cardBackground(context);

    return SizedBox(
      height: height,
      child: LayoutBuilder(
        builder: (context, box) {
          final slot = box.maxWidth / items.length;
          return TweenAnimationBuilder<double>(
            // 0 = full bar, 1 = slimmed down while scrolling.
            tween: Tween<double>(end: minimized && !reduce ? 1 : 0),
            duration: reduce ? Duration.zero : const Duration(milliseconds: 280),
            curve: Curves.easeOutCubic,
            builder: (context, t, _) {
              final barH = lerpDouble(barHeight, barHeightMin, t)!;
              final barTop = height - barH;
              final r = lerpDouble(bubble, bubbleMin, t)! / 2;
              final bubbleCy = barTop + lerpDouble(10, barH / 2, t)!;
              return TweenAnimationBuilder<double>(
                // Starts at the current tab; every later change slides from where it is.
                tween: Tween<double>(end: selected.toDouble()),
                duration: reduce ? Duration.zero : const Duration(milliseconds: 560),
                curve: AppMotion.spring,
                builder: (context, pos, _) {
                  final cx = slot * (pos + 0.5);
                  // Leans into the move, then swings back as the spring settles.
                  final tilt = reduce ? 0.0 : ((selected - pos) * 0.5).clamp(-0.45, 0.45);
                  return Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _NotchedBarPainter(
                            cx: cx,
                            barTop: barTop,
                            depth: lerpDouble(36, 0, t)!,
                            color: barColor,
                            edge: dark ? LayoutTokens.borderSubtle(context) : null,
                            shadow: Colors.black.withValues(alpha: dark ? 0.6 : 0.18),
                          ),
                        ),
                      ),
                      for (var i = 0; i < items.length; i++)
                        Positioned(
                          left: slot * i,
                          width: slot,
                          top: barTop,
                          height: barH,
                          child: _NavSlot(
                            item: items[i],
                            selected: i == selected,
                            // 0 when the raised button is over this tab, 1 when it is a slot away.
                            away: (pos - i).abs().clamp(0.0, 1.0),
                            // Labels fade out as the bar slims down.
                            labelOpacity: 1 - t,
                            iconTop: lerpDouble(13, 10, t)!,
                            onTap: () => onSelect(i),
                          ),
                        ),
                      Positioned(
                        left: cx - r,
                        top: bubbleCy - r,
                        width: r * 2,
                        height: r * 2,
                        child: IgnorePointer(
                          child: Transform.rotate(
                            angle: tilt,
                            child: Container(
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: navy,
                                boxShadow: [
                                  BoxShadow(
                                    color: navy.withValues(alpha: dark ? 0.7 : 0.45),
                                    blurRadius: 14,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: AnimatedSwitcher(
                                duration: reduce ? Duration.zero : const Duration(milliseconds: 220),
                                transitionBuilder: (child, animation) => FadeTransition(
                                    opacity: animation, child: ScaleTransition(scale: animation, child: child)),
                                child: Icon(
                                  items[selected].selectedIcon,
                                  key: ValueKey<int>(selected),
                                  size: lerpDouble(23, 18, t),
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}

/// One tab in the bar: its icon (which fades out as the raised button arrives
/// over it) and its label. A tap gives a quick squash-and-spring so the press is
/// always acknowledged, even for "Sign in", which opens a page instead of
/// moving the button. Names are read aloud by screen readers and show on
/// long-press.
class _NavSlot extends StatefulWidget {
  const _NavSlot({
    required this.item,
    required this.selected,
    required this.away,
    required this.labelOpacity,
    required this.iconTop,
    required this.onTap,
  });

  final _NavItem item;
  final bool selected;
  final double away;
  final double labelOpacity;
  final double iconTop;
  final VoidCallback onTap;

  @override
  State<_NavSlot> createState() => _NavSlotState();
}

class _NavSlotState extends State<_NavSlot> with SingleTickerProviderStateMixin {
  late final AnimationController _press = AnimationController(vsync: this, duration: const Duration(milliseconds: 320), value: 1);

  @override
  void dispose() {
    _press.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final label = Color.lerp(AppTheme.brandInk(context), LayoutTokens.mutedText(context), widget.away)!;
    return Tooltip(
      message: widget.item.label,
      child: Semantics(
        button: true,
        selected: widget.selected,
        label: widget.item.label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            if (!MediaQuery.disableAnimationsOf(context)) _press.forward(from: 0);
            widget.onTap();
          },
          child: AnimatedBuilder(
            animation: _press,
            builder: (context, child) => Transform.scale(
              scale: 0.84 + 0.16 * Curves.easeOutBack.transform(_press.value),
              child: child,
            ),
            child: Stack(
              children: [
                Positioned(
                  top: widget.iconTop,
                  left: 0,
                  right: 0,
                  child: Opacity(
                    opacity: widget.away,
                    child: Icon(widget.item.icon, size: 24, color: LayoutTokens.secondaryText(context)),
                  ),
                ),
                Positioned(
                  bottom: 8,
                  left: 4,
                  right: 4,
                  child: Opacity(
                    opacity: widget.labelOpacity,
                    child: Text(
                      widget.item.label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.1,
                        fontWeight: widget.selected ? FontWeight.w800 : FontWeight.w600,
                        color: label,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The bar, with a round notch cut out of its top edge under the raised button.
class _NotchedBarPainter extends CustomPainter {
  const _NotchedBarPainter({
    required this.cx,
    required this.barTop,
    required this.depth,
    required this.color,
    required this.edge,
    required this.shadow,
  });

  final double cx;
  final double barTop;
  final double depth;
  final Color color;
  final Color? edge;
  final Color shadow;

  static const double _halfWidth = 40;

  @override
  void paint(Canvas canvas, Size size) {
    final top = barTop;
    final w = size.width;
    final h = size.height;
    final radius = math.min(24.0, (h - top) / 2);
    // Keep the notch inside the bar's rounded ends, even on the spring's overshoot.
    final c = cx.clamp(radius + _halfWidth * 0.5, w - radius - _halfWidth * 0.5);

    final path = Path()
      ..moveTo(0, top + radius)
      ..arcToPoint(Offset(radius, top), radius: Radius.circular(radius))
      ..lineTo(c - _halfWidth, top)
      ..cubicTo(c - _halfWidth * 0.65, top, c - _halfWidth * 0.75, top + depth, c, top + depth)
      ..cubicTo(c + _halfWidth * 0.75, top + depth, c + _halfWidth * 0.65, top, c + _halfWidth, top)
      ..lineTo(w - radius, top)
      ..arcToPoint(Offset(w, top + radius), radius: Radius.circular(radius))
      ..lineTo(w, h - radius)
      ..arcToPoint(Offset(w - radius, h), radius: Radius.circular(radius))
      ..lineTo(radius, h)
      ..arcToPoint(Offset(0, h - radius), radius: Radius.circular(radius))
      ..close();

    canvas.drawShadow(path, shadow, 12, false);
    canvas.drawPath(path, Paint()..color = color);
    if (edge != null) {
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1
          ..color = edge!,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _NotchedBarPainter old) =>
      old.cx != cx ||
      old.barTop != barTop ||
      old.depth != depth ||
      old.color != color ||
      old.edge != edge ||
      old.shadow != shadow;
}
