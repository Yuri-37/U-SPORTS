import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';

/// A single season-stat tile: big value over a small caption.
///
/// Tiles share a minimum width and centre both lines so a row of them reads as
/// an aligned grid. Without that, each tile shrink-wraps to its own label and a
/// short value ("2") sits visibly off-centre above a long one ("Match wins").
class StatChip extends StatelessWidget {
  const StatChip({super.key, required this.label, required this.value, this.minWidth = 84, this.emphasis = false});

  final String label;
  final String value;
  final double minWidth;

  /// The one stat a page wants to draw the eye to (e.g. points per game).
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final ink = emphasis ? AppTheme.brandInk(context) : LayoutTokens.primaryText(context);
    return Container(
      constraints: BoxConstraints(minWidth: minWidth),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: emphasis ? ink.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.16 : 0.08) : LayoutTokens.chipBackground(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            value,
            textAlign: TextAlign.center,
            style: AppTheme.display(size: 20, color: ink, height: 1),
          ),
          const SizedBox(height: 4),
          Text(
            label.toUpperCase(),
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: LayoutTokens.mutedText(context),
            ),
          ),
        ],
      ),
    );
  }
}
