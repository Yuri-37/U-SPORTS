import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

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

  /// Display face for headings, matching web's .font-display in
  /// apps/web/src/styles/index.css. google_fonts
  /// falls back to the platform font if it can't be fetched, so a first launch
  /// without connectivity still renders -- just not in Calistoga.
  static TextStyle display({
    required double size,
    required Color color,
    double height = 1.05,
  }) =>
      GoogleFonts.calistoga(
        fontSize: size,
        color: color,
        height: height,
        letterSpacing: -0.02 * size,
      );

  /// Monospace section label -- web's .label-mono.
  static TextStyle labelMono(Color color) => GoogleFonts.jetBrainsMono(
        fontSize: 11,
        color: color,
        fontWeight: FontWeight.w500,
        letterSpacing: 1.6,
      );

  /// Body/UI scale shared by both brightnesses. Mirrors web: DM Sans, with
  /// the relaxed line-height the spec asks for on running text.
  static TextTheme _textTheme(Color primary, Color secondary) {
    final base = GoogleFonts.dmSansTextTheme();
    return base
        .copyWith(
          displayLarge: display(size: 40, color: primary),
          displayMedium: display(size: 32, color: primary),
          headlineLarge: display(size: 28, color: primary),
          headlineMedium: display(size: 24, color: primary),
          titleLarge: base.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
          ),
          titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          bodyLarge: base.bodyLarge?.copyWith(height: 1.6),
          bodyMedium: base.bodyMedium?.copyWith(height: 1.6),
          labelSmall: base.labelSmall?.copyWith(letterSpacing: 1.2),
        )
        .apply(bodyColor: primary, displayColor: primary);
  }

  /// Brand-tinted elevation. A neutral gray shadow reads flat against navy.
  static List<BoxShadow> cardShadow(Brightness b) => [
        BoxShadow(
          color: b == Brightness.dark
              ? Colors.black.withValues(alpha: 0.45)
              : schoolPrimary.withValues(alpha: 0.10),
          blurRadius: 14,
          offset: const Offset(0, 4),
        ),
      ];

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgPrimary,
      textTheme: _textTheme(Colors.white, const Color(0xFF8888A0)),
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
          backgroundColor: schoolPrimary,
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
      textTheme: _textTheme(const Color(0xFF0F172A), const Color(0xFF475569)),
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
          backgroundColor: schoolPrimary,
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
