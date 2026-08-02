import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'config/env.dart';
import 'providers/appearance_provider.dart';
import 'services/router.dart';

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
    throw StateError('SUPABASE_URL must be an absolute URL (e.g. http://192.168.1.10:54321), got: "${Env.supabaseUrl}"');
  }

  await Supabase.initialize(
    url: Env.supabaseUrl,
    anonKey: Env.supabaseAnonKey,
  );

  await AppearanceDarkModeNotifier.preload();

  try {
    await Firebase.initializeApp();
  } catch (e, st) {
    debugPrint('Firebase init skipped (configure FlutterFire for push): $e\n$st');
  }

  runApp(const ProviderScope(child: USportsApp()));
}

class USportsApp extends ConsumerWidget {
  const USportsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final theme = ref.watch(appThemeProvider);

    return MaterialApp.router(
      title: 'U-Sports',
      theme: theme,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
