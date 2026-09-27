import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// App-wide colors, type and component themes.
///
/// Layout language: a navy gradient hero at the top of each page with an
/// off-white sheet overlapping it (see `widgets/ui/brand_page.dart`). The
/// school's own colors carry the brand -- navy for surfaces and actions, gold
/// only ever on navy. There is no bright accent blue: it read as neon on light
/// backgrounds, so interactive color is the school navy (and a soft blue tint
/// of it in dark mode, where navy text would disappear).
class AppTheme {
  static const Color bgPrimary = Color(0xFF0A0A0F);
  static const Color bgSecondary = Color(0xFF111118);
  static const Color surfaceCard = Color(0xFF16161E);
  static const Color surfaceElevated = Color(0xFF1E1E2A);
  static const Color borderSubtle = Color(0x14FFFFFF);
  static const Color borderSubtleLight = Color(0x140F172A);

  /// Kept for existing references; resolves to the school navy rather than the
  /// old electric blue. Prefer [brandInk] for text so dark mode stays legible.
  static const Color accent = Color(0xFF002D62);
  static const Color warning = Color(0xFFFFB800);
  static const Color danger = Color(0xFFFF3355);

  /// Off-white sheet that overlaps the hero (light mode).
  static const Color sheetLight = Color(0xFFEEF1F6);

  /// Ink colors for text on the light sheet.
  static const Color inkLight = Color(0xFF0F1B2D);
  static const Color inkMutedLight = Color(0xFF55637A);

  /// Soft blue tint of navy for text and controls in dark mode, where navy
  /// itself is unreadable. Same value as web's dark `--brand-ink`.
  static const Color brandInkDark = Color(0xFF8FB2FF);

  // School branding - overridden at runtime from institution table
  static Color schoolPrimary = const Color(0xFF002D62);
  static Color schoolSecondary = const Color(0xFFFFD700);

  /// Brand color safe to use as text/icon color on the page background.
  static Color brandInk(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? brandInkDark : schoolPrimary;

  /// Hero gradient, top to bottom. Derived from the school color so a school
  /// with a different primary still gets a coherent header.
  static List<Color> heroGradient() => [
        Color.lerp(schoolPrimary, Colors.white, 0.14)!,
        schoolPrimary,
        Color.lerp(schoolPrimary, Colors.black, 0.22)!,
      ];

  /// Headline face: Plus Jakarta Sans at heavy weight with tight tracking.
  /// google_fonts falls back to the platform font when offline.
  static TextStyle display({
    required double size,
    required Color color,
    double height = 1.1,
    FontWeight weight = FontWeight.w800,
  }) =>
      GoogleFonts.plusJakartaSans(
        fontSize: size,
        color: color,
        height: height,
        fontWeight: weight,
        letterSpacing: -0.025 * size,
      );

  /// Small uppercase label that opens a block ("PLAYING NOW", "SEASON").
  static TextStyle overline(Color color) => GoogleFonts.plusJakartaSans(
        fontSize: 11,
        color: color,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.4,
      );

  static TextTheme _textTheme(Color primary) {
    final base = GoogleFonts.plusJakartaSansTextTheme();
    return base
        .copyWith(
          displayLarge: display(size: 40, color: primary),
          displayMedium: display(size: 32, color: primary),
          headlineLarge: display(size: 28, color: primary),
          headlineMedium: display(size: 24, color: primary),
          headlineSmall: display(size: 20, color: primary),
          titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3),
          titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          titleSmall: base.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          bodyLarge: base.bodyLarge?.copyWith(height: 1.55),
          bodyMedium: base.bodyMedium?.copyWith(height: 1.5),
          labelLarge: base.labelLarge?.copyWith(fontWeight: FontWeight.w700),
          labelSmall: base.labelSmall?.copyWith(letterSpacing: 0.4),
        )
        .apply(bodyColor: primary, displayColor: primary);
  }

  /// Soft, brand-tinted elevation for cards on the sheet.
  static List<BoxShadow> cardShadow(Brightness b) => [
        BoxShadow(
          color: b == Brightness.dark
              ? Colors.black.withValues(alpha: 0.45)
              : schoolPrimary.withValues(alpha: 0.07),
          blurRadius: 18,
          offset: const Offset(0, 6),
        ),
      ];

  static ThemeData dark() => _build(Brightness.dark);
  static ThemeData light() => _build(Brightness.light);

  static ThemeData _build(Brightness b) {
    final dark = b == Brightness.dark;
    final ink = dark ? Colors.white : inkLight;
    final muted = dark ? const Color(0xFF8C8CA6) : inkMutedLight;
    final interactive = dark ? brandInkDark : schoolPrimary;
    final card = dark ? surfaceCard : Colors.white;
    final field = dark ? surfaceElevated : Colors.white;
    final border = dark ? borderSubtle : borderSubtleLight;
    final text = _textTheme(ink);

    OutlineInputBorder outline(Color c, [double w = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c, width: w),
        );

    return ThemeData(
      useMaterial3: true,
      brightness: b,
      scaffoldBackgroundColor: dark ? bgPrimary : sheetLight,
      textTheme: text,
      colorScheme: dark
          ? ColorScheme.dark(
              primary: brandInkDark,
              onPrimary: const Color(0xFF051A3A),
              secondary: schoolPrimary,
              surface: surfaceCard,
              onSurface: Colors.white,
              error: danger,
            )
          : ColorScheme.light(
              primary: schoolPrimary,
              onPrimary: Colors.white,
              secondary: schoolPrimary,
              surface: Colors.white,
              onSurface: inkLight,
              error: const Color(0xFFDC2626),
            ),
      // Any page that still uses a plain AppBar gets the hero's navy so it
      // reads as part of the same system rather than a white strip.
      appBarTheme: AppBarTheme(
        backgroundColor: schoolPrimary,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: display(size: 19, color: Colors.white, height: 1.2),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: border),
        ),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: interactive,
          foregroundColor: dark ? const Color(0xFF051A3A) : Colors.white,
          elevation: 0,
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: interactive,
          foregroundColor: dark ? const Color(0xFF051A3A) : Colors.white,
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: interactive,
          side: BorderSide(color: border),
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: interactive,
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: card,
        selectedColor: interactive,
        checkmarkColor: dark ? const Color(0xFF051A3A) : Colors.white,
        side: BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        labelStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, color: ink),
        // The default label padding clips a ChoiceChip's text on a phone --
        // wide enough for the checkmark plus a couple of words.
        labelPadding: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: field,
        border: outline(border),
        enabledBorder: outline(border),
        focusedBorder: outline(interactive, 1.5),
        labelStyle: TextStyle(color: muted, fontSize: 13),
        hintStyle: TextStyle(color: muted.withValues(alpha: 0.8)),
        prefixIconColor: muted,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: interactive),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : null,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? interactive : null,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: dark ? bgSecondary : sheetLight,
        // Several sheets draw their own handle; forcing one here doubled it.
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        indicatorColor: interactive.withValues(alpha: dark ? 0.18 : 0.10),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => GoogleFonts.plusJakartaSans(
            fontSize: 11,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: s.contains(WidgetState.selected) ? interactive : muted,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(
            size: 24,
            color: s.contains(WidgetState.selected) ? interactive : muted,
          ),
        ),
      ),
    );
  }
}
