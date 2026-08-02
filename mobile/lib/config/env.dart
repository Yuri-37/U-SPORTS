/// Compile-time configuration via `--dart-define`.
///
/// Source of truth: `mobile/.env` (loaded by `run_physical.ps1` / `run_emulator.ps1`).
/// Use the same local Supabase as web (`http://127.0.0.1:54321`); scripts rewrite the host
/// for physical devices/emulator (phone cannot reach 127.0.0.1 on your PC).
class Env {
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// REST API base URL including `/api` suffix, e.g. `http://localhost:3001/api`
  static const String apiBaseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://127.0.0.1:3001/api',
  );
}
