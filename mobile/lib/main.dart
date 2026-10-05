import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'config/env.dart';
import 'providers/appearance_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/connectivity_provider.dart';
import 'providers/institution_provider.dart';
import 'services/push_notifications_service.dart';
import 'services/router.dart';
import 'widgets/offline_banner.dart';

/// Set once Firebase.initializeApp() succeeds below — push setup is skipped
/// entirely otherwise (no google-services.json/GoogleService-Info.plist yet
/// means every FirebaseMessaging call would throw).
bool _firebaseReady = false;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (Env.supabaseUrl.isEmpty || Env.supabaseAnonKey.isEmpty) {
    throw StateError(
      'SUPABASE_URL and SUPABASE_ANON_KEY are missing. They are compile-time --dart-define values, '
      'not read from .env at runtime.\n\n'
      'Use:\n'
      '  .\\run_physical.ps1   — physical Android (reads mobile/.env)\n'
      '  .\\run_emulator.ps1    — Android emulator\n'
      'Or VS Code / Cursor launch: "U-Sports Mobile (Physical Device)" / "(Emulator)".\n\n'
      'Plain `flutter run` without those defines will not load Supabase.',
    );
  }
  final supaUri = Uri.tryParse(Env.supabaseUrl);
  if (supaUri == null || !supaUri.hasScheme || supaUri.host.isEmpty) {
    throw StateError(
        'SUPABASE_URL must be an absolute URL (e.g. http://192.168.1.10:54321), got: "${Env.supabaseUrl}"');
  }

  await Supabase.initialize(
    url: Env.supabaseUrl,
    anonKey: Env.supabaseAnonKey,
  );

  await AppearanceDarkModeNotifier.preload();

  try {
    await Firebase.initializeApp();
    _firebaseReady = true;
  } catch (e, st) {
    debugPrint(
        'Firebase init skipped (configure FlutterFire for push): $e\n$st');
  }

  runApp(const ProviderScope(child: USportsApp()));
}

class USportsApp extends ConsumerStatefulWidget {
  const USportsApp({super.key});

  @override
  ConsumerState<USportsApp> createState() => _USportsAppState();
}

class _USportsAppState extends ConsumerState<USportsApp> with WidgetsBindingObserver {
  final _appLinks = AppLinks();
  DateTime _lastInstitutionRefresh = DateTime.now();
  StreamSubscription<Uri>? _linkSub;

  /// Coming back to the app after a while re-reads the school profile, so a
  /// color, logo or name change made on the website shows up without killing
  /// and restarting the app. (The theme rebuilds from institutionProvider.)
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    final now = DateTime.now();
    if (now.difference(_lastInstitutionRefresh) < const Duration(minutes: 2)) return;
    _lastInstitutionRefresh = now;
    ref.invalidate(institutionProvider);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (_firebaseReady) {
      ref.read(pushNotificationsServiceProvider).init();
    }

    // A profile fetch stuck mid-offline (see auth_provider.dart's
    // _authFetchTimeout / router.dart's fail-open redirect) never retries on
    // its own once connectivity returns — nothing else in the app watches
    // isOnlineProvider. Invalidate and force the router to re-run its
    // redirect so a previously-failed/guest-downgraded session recovers
    // automatically instead of staying stuck.
    ref.listenManual(isOnlineProvider, (prev, next) {
      final wasOffline = prev?.value == false;
      final isOnlineNow = next.value == true;
      if (wasOffline && isOnlineNow) {
        ref.invalidate(profileProvider);
        ref.read(routerProvider).refresh();
      }
    });

    // Password-reset email link (usports://reset-password#access_token=...) —
    // covers both "app already running" and cold-start-from-terminated.
    _linkSub = _appLinks.uriLinkStream.listen(_handlePasswordResetLink);
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handlePasswordResetLink(uri);
    });
  }

  Future<void> _handlePasswordResetLink(Uri uri) async {
    if (uri.scheme != 'usports' || uri.host != 'reset-password') return;
    try {
      await Supabase.instance.client.auth.getSessionFromUrl(uri);
    } catch (_) {
      // Fall through regardless — ResetPasswordScreen shows its own
      // invalid/expired message when there's no session to work with.
    }
    if (!mounted) return;
    ref.read(routerProvider).refresh();
    rootNavigatorKey.currentContext?.go('/auth/reset-password');
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final theme = ref.watch(appThemeProvider);

    return MaterialApp.router(
      title: 'U-Sports',
      theme: theme,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      builder: (context, child) {
        return Stack(
          children: [
            if (child != null) child,
            const OfflineBanner(),
          ],
        );
      },
    );
  }
}
