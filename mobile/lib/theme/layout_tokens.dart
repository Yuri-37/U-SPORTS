import 'package:flutter/material.dart';

/// Brightness-aware surface/text tokens — values mirror web's CSS custom
/// properties (`apps/web/src/styles/index.css`) exactly, so the two clients
/// read as the same product. `danger` and `warning` are deliberately NOT
/// here: web's own UI kit (`Button`/`Badge`/`Alert` in
/// `apps/web/src/components/ui/index.tsx`) hardcodes those as fixed brand
/// colors regardless of theme (`AppTheme.danger`/`AppTheme.warning`) — only
/// `success` actually varies by theme on web, via `var(--success)`.
class LayoutTokens {
  LayoutTokens._();

  /// Bracket canvas. Fixed dark regardless of app theme — matches web's
  /// `BracketView`, which hardcodes `bg-[#111118]` rather than a theme var.
  static const Color bracketCanvas = Color(0xFF111118);

  static Color cardBackground(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? const Color(0xFF16161E) : Colors.white;
  }

  /// Web `--surface-elevated`. Also used as the unselected-chip fill —
  /// independent of `colorScheme.secondary` (overridden per-institution) so
  /// label contrast never depends on the school's brand color.
  static Color chipBackground(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? const Color(0xFF1E1E2A) : const Color(0xFFF8FAFC);
  }

  static Color borderSubtle(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? const Color(0x14FFFFFF) : const Color(0x1A0F172A);
  }

  static Color secondaryText(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF8888A0)
        : const Color(0xFF475569);
  }

  static Color mutedText(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF7E7E9A)
        : const Color(0xFF64748B);
  }

  static Color primaryText(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? Colors.white
        : const Color(0xFF0F172A);
  }

  /// Web `--success`: the one status color that actually differs by theme.
  static Color success(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF22C55E)
        : const Color(0xFF059669);
  }
}
