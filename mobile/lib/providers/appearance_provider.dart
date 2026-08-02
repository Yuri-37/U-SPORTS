import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';
import 'institution_provider.dart';

const _kDarkMode = 'appearance_dark_mode';

final appearanceDarkModeProvider = NotifierProvider<AppearanceDarkModeNotifier, bool>(
  AppearanceDarkModeNotifier.new,
);

class AppearanceDarkModeNotifier extends Notifier<bool> {
  /// Set by [preload] before `runApp` so [build] returns the persisted value
  /// on the very first frame instead of flashing light mode while the async
  /// SharedPreferences read is still in flight.
  static bool? _preloaded;

  static Future<void> preload() async {
    final prefs = await SharedPreferences.getInstance();
    _preloaded = prefs.getBool(_kDarkMode) ?? false;
  }

  @override
  bool build() {
    if (_preloaded != null) return _preloaded!;
    Future.microtask(_load);
    return false;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getBool(_kDarkMode) ?? false;
    state = v;
  }

  Future<void> setDark(bool dark) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kDarkMode, dark);
    state = dark;
  }

  Future<void> toggle() => setDark(!state);
}

final appThemeProvider = Provider<ThemeData>((ref) {
  final dark = ref.watch(appearanceDarkModeProvider);
  // Recompute once the institution's brand colors resolve, since
  // AppTheme.dark()/light() read the mutable AppTheme.schoolPrimary/
  // schoolSecondary statics that institutionProvider sets as a side effect.
  ref.watch(institutionProvider);
  return dark ? AppTheme.dark() : AppTheme.light();
});
