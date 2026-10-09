import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';

/// A newer Android version than the one installed.
class AppUpdate {
  AppUpdate({required this.version, required this.downloadUrl});
  final String version;
  final String downloadUrl;
}

const _dismissedKey = 'usports.update.dismissedVersion';

/// True when [latest] is a higher version than [installed]. Compares the numeric
/// parts ("1.10.7" > "1.9.0"); anything unparsable counts as "not newer", so a
/// malformed answer can never nag someone.
bool isNewerVersion(String latest, String installed) {
  List<int>? parts(String v) {
    final out = <int>[];
    for (final p in v.trim().split('+').first.split('.')) {
      final n = int.tryParse(p);
      if (n == null) return null;
      out.add(n);
    }
    return out;
  }

  final a = parts(latest);
  final b = parts(installed);
  if (a == null || b == null) return false;
  for (var i = 0; i < 3; i++) {
    final x = i < a.length ? a[i] : 0;
    final y = i < b.length ? b[i] : 0;
    if (x != y) return x > y;
  }
  return false;
}

/// Asks the API for the newest published version. Anything that goes wrong
/// (offline, server asleep, no answer) is "no update": this is a courtesy, never
/// something that gets in the way of using the app.
final appUpdateProvider = FutureProvider<AppUpdate?>((ref) async {
  try {
    final info = await PackageInfo.fromPlatform();
    final data = await ref.read(apiClientProvider).getJson('/app/latest');
    if (data is! Map) return null;
    final latest = data['latest'];
    final url = data['download_url'];
    if (latest is! String || url is! String) return null;
    if (!isNewerVersion(latest, info.version)) return null;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_dismissedKey) == latest) return null;
    return AppUpdate(version: latest, downloadUrl: url);
  } catch (_) {
    return null;
  }
});

Future<void> dismissAppUpdate(String version) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_dismissedKey, version);
}
