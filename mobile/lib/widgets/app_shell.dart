import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import '../theme/motion.dart';
import '../theme/layout_tokens.dart';
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
      context.go('/auth/login');
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
          : Scaffold(
              body: navigationShell,
              // Four round buttons floating above the page, icons only; the page's own
              // colour fills the strip around them so it reads as one surface.
              bottomNavigationBar: ColoredBox(
                color: LayoutTokens.sheet(context),
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 10, 20, 8),
                    child: _PillNav(
                      items: [
                        const _NavItem('Home', Icons.home_outlined, Icons.home_rounded),
                        const _NavItem('Rankings', Icons.emoji_events_outlined, Icons.emoji_events_rounded),
                        const _NavItem('Events', Icons.calendar_today_outlined, Icons.calendar_today_rounded),
                        _NavItem(profileLabel, profileIcon, profileIconSelected),
                      ],
                      selected: selected,
                      onSelect: (i) => _onTap(context, i, role),
                    ),
                  ),
                ),
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

/// The portrait navigation: four separate round buttons floating in a row, like
/// the sideways arc. The page you are on is a filled navy disc with a soft glow;
/// the others are plain discs with a shadow. Every tap pops the button with a
/// small spring and sends out a ring. Names show on long-press and are read
/// aloud by screen readers.
class _PillNav extends StatelessWidget {
  const _PillNav({required this.items, required this.selected, required this.onSelect});

  final List<_NavItem> items;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _OrbButton.size + 12,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (var i = 0; i < items.length; i++)
            _OrbButton(item: items[i], selected: i == selected, onTap: () => onSelect(i)),
        ],
      ),
    );
  }
}

class _OrbButton extends StatefulWidget {
  const _OrbButton({required this.item, required this.selected, required this.onTap});

  static const double size = 56;

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_OrbButton> createState() => _OrbButtonState();
}

class _OrbButtonState extends State<_OrbButton> with SingleTickerProviderStateMixin {
  /// One shot per tap or selection: drives the spring pop and the ring.
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));

  @override
  void didUpdateWidget(covariant _OrbButton old) {
    super.didUpdateWidget(old);
    if (widget.selected && !old.selected) _play();
  }

  void _play() {
    if (MediaQuery.disableAnimationsOf(context)) return;
    _pulse.forward(from: 0);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final reduce = MediaQuery.disableAnimationsOf(context);
    final selected = widget.selected;
    final navy = AppTheme.schoolPrimary;
    final fill = selected ? navy : LayoutTokens.cardBackground(context);
    final ring = selected ? Colors.white.withValues(alpha: 0.9) : LayoutTokens.borderSubtle(context);
    final glow = <BoxShadow>[
      if (selected) ...[
        // A side glow in the school colour, plus a tight shadow under it.
        BoxShadow(color: navy.withValues(alpha: dark ? 0.75 : 0.55), blurRadius: 22, spreadRadius: 1, offset: const Offset(0, 5)),
        BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 8, offset: const Offset(0, 3)),
      ] else
        BoxShadow(color: Colors.black.withValues(alpha: dark ? 0.5 : 0.14), blurRadius: 14, offset: const Offset(0, 4)),
    ];

    final orb = AnimatedContainer(
      duration: reduce ? Duration.zero : const Duration(milliseconds: 260),
      curve: AppMotion.easeOutStrong,
      width: _OrbButton.size,
      height: _OrbButton.size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: fill,
        border: Border.all(color: ring, width: selected ? 2 : 1),
        boxShadow: glow,
      ),
      child: Icon(
        selected ? widget.item.selectedIcon : widget.item.icon,
        size: 25,
        color: selected ? Colors.white : LayoutTokens.mutedText(context),
      ),
    );

    return Tooltip(
      message: widget.item.label,
      child: Semantics(
        button: true,
        selected: selected,
        label: widget.item.label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            _play();
            widget.onTap();
          },
          child: AnimatedBuilder(
            animation: _pulse,
            child: orb,
            builder: (context, child) {
              final t = _pulse.value;
              final running = _pulse.isAnimating;
              // Squash, then spring up past full size and settle: back-out curve.
              final pop = running ? 0.82 + 0.18 * Curves.easeOutBack.transform(t.clamp(0.0, 1.0)) : 1.0;
              final lift = selected ? 1.08 : 1.0;
              return SizedBox(
                width: _OrbButton.size + 8,
                height: _OrbButton.size + 8,
                child: Stack(
                  alignment: Alignment.center,
                  clipBehavior: Clip.none,
                  children: [
                    if (running)
                      Transform.scale(
                        scale: 1 + 0.9 * Curves.easeOut.transform(t),
                        child: Container(
                          width: _OrbButton.size,
                          height: _OrbButton.size,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: navy.withValues(alpha: 0.55 * (1 - t)), width: 3),
                          ),
                        ),
                      ),
                    AnimatedScale(
                      scale: lift,
                      duration: reduce ? Duration.zero : const Duration(milliseconds: 350),
                      curve: Curves.easeOutBack,
                      child: Transform.scale(scale: pop, child: child),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
