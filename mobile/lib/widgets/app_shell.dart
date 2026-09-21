import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';

/// Persistent bottom nav shell for the four tab branches (Home, Standings,
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
    // system back press on Standings/Events/Profile would otherwise fall
    // through to the OS and exit the app. Only let that happen from Home —
    // everywhere else, back should return to Home first, matching how the
    // bottom nav itself behaves.
    return PopScope(
      canPop: navigationShell.currentIndex == 0,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        navigationShell.goBranch(0);
      },
      child: Scaffold(
        body: navigationShell,
        bottomNavigationBar: BottomNavigationBar(
          type: BottomNavigationBarType.fixed,
          selectedFontSize: 11,
          unselectedFontSize: 10,
          currentIndex: _displayFor(navigationShell.currentIndex),
          onTap: (i) => _onTap(context, i, role),
          items: [
            const BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home),
              label: 'Home',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.emoji_events_outlined),
              activeIcon: Icon(Icons.emoji_events),
              label: 'Standings',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.calendar_today_outlined),
              activeIcon: Icon(Icons.calendar_today),
              label: 'Events',
            ),
            BottomNavigationBarItem(
              icon: Icon(
                  role == 'Coach' ? Icons.groups_outlined : Icons.person_outline),
              activeIcon: Icon(role == 'Coach' ? Icons.groups : Icons.person),
              label: switch (role) {
                'Coach' => 'My Teams',
                'guest' => 'Sign in',
                _ => 'Profile',
              },
            ),
          ],
        ),
      ),
    );
  }
}
