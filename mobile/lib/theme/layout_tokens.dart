import 'package:flutter/material.dart';

/// Brightness-aware surface/text tokens — values mirror web's CSS custom
/// properties (`apps/web/src/styles/index.css`) exactly, so the two clients
/// read as the same product.
///
/// `danger`/`warning` below are for components that mirror a web component
/// reading `var(--danger)`/`var(--warning)` directly (e.g. `AnnouncementBanner.tsx`
/// — those CSS vars genuinely shift to a muted `#dc2626`/`#d97706` in light
/// mode). For components mirroring web's UI kit instead (`Button`/`Badge`/`Alert`
/// in `apps/web/src/components/ui/index.tsx`, which hardcode the brand colors
/// regardless of theme), keep using the fixed `AppTheme.danger`/`AppTheme.warning`.
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

  /// Web `--danger`. See class doc — use this over `AppTheme.danger` for
  /// anything mirroring a web component that reads the CSS var directly.
  static Color danger(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFFFF3355)
        : const Color(0xFFDC2626);
  }

  /// Web `--warning`. See class doc — use this over `AppTheme.warning` for
  /// anything mirroring a web component that reads the CSS var directly.
  static Color warning(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFFFFB800)
        : const Color(0xFFD97706);
  }
}
