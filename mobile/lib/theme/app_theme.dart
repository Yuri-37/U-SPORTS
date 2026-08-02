import 'package:flutter/material.dart';

/// Values mirror web's CSS custom properties exactly
/// (`apps/web/src/styles/index.css`) so the two clients read as the same
/// product. `danger`/`warning` are fixed brand colors on both — web's UI kit
/// (`apps/web/src/components/ui/index.tsx`) hardcodes them regardless of
/// theme; only neutrals/surfaces and `success` (see `LayoutTokens.success`)
/// actually vary by brightness.
class AppTheme {
  static const Color bgPrimary = Color(0xFF0A0A0F);
  static const Color bgSecondary = Color(0xFF111118);
  static const Color surfaceCard = Color(0xFF16161E);
  static const Color surfaceElevated = Color(0xFF1E1E2A);
  static const Color borderSubtle = Color(0x14FFFFFF);
  static const Color borderSubtleLight = Color(0x1A0F172A);
  static const Color accent = Color(0xFF0066FF);
  static const Color warning = Color(0xFFFFB800);
  static const Color danger = Color(0xFFFF3355);

  // School branding - overridden at runtime from institution table
  static Color schoolPrimary = const Color(0xFF002D62);
  static Color schoolSecondary = const Color(0xFFFFD700);

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgPrimary,
      colorScheme: ColorScheme.dark(
        primary: accent,
        secondary: schoolPrimary,
        surface: surfaceCard,
        onSurface: Colors.white,
        error: danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surfaceCard,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
      cardTheme: CardThemeData(
        color: surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: borderSubtle),
        ),
        elevation: 0,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceElevated,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: accent, width: 1.5),
        ),
        labelStyle: const TextStyle(color: Color(0xFF8888A0), fontSize: 13),
        hintStyle: const TextStyle(color: Color(0xFF7E7E9A)),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surfaceCard,
        selectedItemColor: accent,
        unselectedItemColor: Color(0xFF7E7E9A),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
    );
  }

  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: const Color(0xFFF1F5F9),
      colorScheme: ColorScheme.light(
        primary: accent,
        secondary: schoolPrimary,
        surface: const Color(0xFFFFFFFF),
        onSurface: const Color(0xFF0F172A),
        error: danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFFFFFFFF),
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: Color(0xFF0F172A),
        ),
      ),
      cardTheme: CardThemeData(
        color: const Color(0xFFFFFFFF),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: borderSubtleLight),
        ),
        elevation: 0,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: borderSubtleLight),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: borderSubtleLight),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: accent, width: 1.5),
        ),
        labelStyle: const TextStyle(color: Color(0xFF475569), fontSize: 13),
        hintStyle: const TextStyle(color: Color(0xFF64748B)),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Color(0xFFFFFFFF),
        selectedItemColor: accent,
        unselectedItemColor: Color(0xFF64748B),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
    );
  }
}
