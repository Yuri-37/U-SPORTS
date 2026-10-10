import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import 'ui/brand_page.dart' show isCompactHeight;

/// Persistent bottom nav shell for the four tab branches (Home, Rankings,
/// Events, Profile). Each branch keeps its own Navigator/state via
/// [StatefulShellRoute.indexedStack] so switching tabs no longer rebuilds
/// the destination screen or refetches its data.
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
          // A phone held sideways has no height to spare: the navigation moves
          // to the left edge, so the page keeps the full height.
          ? Scaffold(
              body: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: LayoutTokens.cardBackground(context),
                      border: Border(right: BorderSide(color: LayoutTokens.borderSubtle(context))),
                    ),
                    child: SizedBox(
                      // Rail width plus the left inset the SafeArea adds.
                      width: 56 + MediaQuery.paddingOf(context).left,
                      child: Column(
                        children: [
                          // The rail would otherwise paint white behind the clock
                          // and status icons; keep that strip the header's colour.
                          ColoredBox(
                            color: AppTheme.heroGradient().first,
                            child: SizedBox(height: MediaQuery.paddingOf(context).top, width: double.infinity),
                          ),
                          Expanded(
                            child: SafeArea(
                      top: false,
                      right: false,
                      child: NavigationRail(
                        backgroundColor: Colors.transparent,
                        minWidth: 56,
                        groupAlignment: 0,
                        useIndicator: true,
                        selectedIndex: selected,
                        onDestinationSelected: (i) => _onTap(context, i, role),
                        labelType: NavigationRailLabelType.none,
                        indicatorColor: AppTheme.brandInk(context).withValues(alpha: 0.12),
                        selectedIconTheme: IconThemeData(color: AppTheme.brandInk(context)),
                        unselectedIconTheme: IconThemeData(color: LayoutTokens.mutedText(context)),
                        destinations: [
                          const NavigationRailDestination(
                            icon: Icon(Icons.home_outlined),
                            selectedIcon: Icon(Icons.home_rounded),
                            label: Text('Home'),
                          ),
                          const NavigationRailDestination(
                            icon: Icon(Icons.emoji_events_outlined),
                            selectedIcon: Icon(Icons.emoji_events_rounded),
                            label: Text('Rankings'),
                          ),
                          const NavigationRailDestination(
                            icon: Icon(Icons.calendar_today_outlined),
                            selectedIcon: Icon(Icons.calendar_today_rounded),
                            label: Text('Events'),
                          ),
                          NavigationRailDestination(
                            icon: Icon(profileIcon),
                            selectedIcon: Icon(profileIconSelected),
                            label: Text(profileLabel),
                          ),
                        ],
                      ),
                    ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  // The rail already sits in the left inset.
                  Expanded(
                    child: MediaQuery.removePadding(
                      context: context,
                      removeLeft: true,
                      child: navigationShell,
                    ),
                  ),
                ],
              ),
            )
          : Scaffold(
              body: navigationShell,
              // A hairline and soft lift separate the bar from the sheet above it.
              bottomNavigationBar: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: LayoutTokens.borderSubtle(context))),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 16,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: NavigationBar(
                  selectedIndex: selected,
                  onDestinationSelected: (i) => _onTap(context, i, role),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  destinations: [
                    const NavigationDestination(
                      icon: Icon(Icons.home_outlined),
                      selectedIcon: Icon(Icons.home_rounded),
                      label: 'Home',
                    ),
                    const NavigationDestination(
                      icon: Icon(Icons.emoji_events_outlined),
                      selectedIcon: Icon(Icons.emoji_events_rounded),
                      label: 'Rankings',
                    ),
                    const NavigationDestination(
                      icon: Icon(Icons.calendar_today_outlined),
                      selectedIcon: Icon(Icons.calendar_today_rounded),
                      label: 'Events',
                    ),
                    NavigationDestination(
                      icon: Icon(profileIcon),
                      selectedIcon: Icon(profileIconSelected),
                      label: profileLabel,
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
