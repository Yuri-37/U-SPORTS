import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/auth_provider.dart';
import 'push_notifications_service.dart';
import '../screens/athlete/athlete_dashboard_screen.dart';
import '../screens/auth_screen.dart';
import '../screens/bracket_screen.dart';
import '../screens/event_detail_screen.dart';
import '../screens/events_screen.dart';
import '../screens/forgot_password_screen.dart';
import '../screens/home_screen.dart';
import '../screens/leaderboard_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/reset_password_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/athlete_profile_screen.dart';
import '../screens/sport_detail_screen.dart';
import '../screens/team_detail_screen.dart';
import '../widgets/app_shell.dart';

/// Lets push_notifications_service.dart navigate on a tap (foreground local
/// notification, backgrounded-tap, or cold-start-from-terminated) without a
/// BuildContext of its own — the standard go_router pattern for navigating
/// from outside the widget tree.
final rootNavigatorKey = GlobalKey<NavigatorState>();

bool _isGuestAllowedPath(String path) {
  if (path == '/' || path == '/auth/login') return true;
  if (path == '/auth/forgot-password' || path == '/auth/reset-password') {
    return true;
  }
  if (path.startsWith('/leaderboards')) return true;
  if (path.startsWith('/events')) return true;
  if (path.startsWith('/athletes')) return true;
  if (path.startsWith('/teams')) return true;
  if (path.startsWith('/sport/')) return true;
  if (path == '/settings') return true;
  return false;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ref.watch(authRefreshNotifierProvider);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) async {
      final path = state.uri.path;
      final user = Supabase.instance.client.auth.currentUser;

      if (user == null) {
        if (_isGuestAllowedPath(path)) return null;
        return '/auth/login';
      }

      // A timed-out/failed profile fetch (see auth_provider.dart's
      // _authFetchTimeout) must not leave this redirect stuck forever —
      // fail open to guest so the app still renders something. main.dart's
      // reconnect listener retries the real fetch once connectivity returns.
      String role;
      try {
        final profile = await ref.read(profileProvider.future);
        role = profile?.role ?? 'guest';
      } catch (_) {
        role = 'guest';
      }

      if (path == '/settings') {
        if (role == 'athlete') return '/athlete/settings';
        return null;
      }

      // Staff (Admin/Organizer/Coach — plus legacy super_admin/organizer) must use the web platform.
      const staffRoles = {
        'Admin',
        'Organizer',
        'Coach',
        'super_admin',
        'organizer'
      };
      if (staffRoles.contains(role)) {
        await ref.read(pushNotificationsServiceProvider).unregisterToken();
        await Supabase.instance.client.auth.signOut();
        return '/auth/login';
      }

      if (path.startsWith('/notifications')) {
        if (role != 'athlete') return '/';
        return null;
      }

      // Athlete "profile" is deprecated — the dashboard is the athlete home.
      if (path == '/athlete/profile') {
        return role == 'athlete' ? '/athlete/dashboard' : '/';
      }

      if (path.startsWith('/athlete/')) {
        if (role != 'athlete') return '/';
        return null;
      }

      return null;
    },
    routes: [
      // Four persistent tab branches, wrapped in AppShell's bottom nav bar.
      // Each branch keeps its own Navigator/state across tab switches.
      StatefulShellRoute.indexedStack(
        builder: (ctx, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/', builder: (ctx, _) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/leaderboards',
                builder: (ctx, _) => const LeaderboardScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/events', builder: (ctx, _) => const EventsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/athlete/dashboard',
                builder: (ctx, _) => const AthleteDashboardScreen()),
          ]),
        ],
      ),
      // Full-screen routes pushed on top of the shell (no bottom nav).
      GoRoute(
        path: '/events/:id',
        builder: (ctx, st) => EventDetailScreen(
          eventId: st.pathParameters['id']!,
          initialTab: st.uri.queryParameters['tab'] == 'matches' ? 1 : 0,
        ),
      ),
      GoRoute(
        path: '/events/:id/bracket',
        builder: (ctx, st) => BracketScreen(eventId: st.pathParameters['id']!),
      ),
      GoRoute(
        path: '/athletes/:id',
        builder: (ctx, st) =>
            AthleteProfileScreen(athleteId: st.pathParameters['id']!),
      ),
      GoRoute(
        path: '/teams/:id',
        builder: (ctx, st) =>
            TeamDetailScreen(teamId: st.pathParameters['id']!),
      ),
      GoRoute(
        path: '/sport/:sport',
        builder: (ctx, st) =>
            SportDetailScreen(sport: st.pathParameters['sport']!),
      ),
      GoRoute(
          path: '/notifications',
          builder: (ctx, _) => const NotificationsScreen()),
      GoRoute(path: '/auth/login', builder: (ctx, _) => const AuthScreen()),
      GoRoute(
        path: '/auth/forgot-password',
        builder: (ctx, _) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/auth/reset-password',
        builder: (ctx, _) => const ResetPasswordScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (ctx, _) => const SettingsScreen(shell: SettingsShell.guest),
      ),
      // /athlete/profile is redirected to /athlete/dashboard (see redirect above).
      GoRoute(
        path: '/athlete/settings',
        builder: (ctx, _) => const SettingsScreen(shell: SettingsShell.athlete),
      ),
    ],
  );
});
