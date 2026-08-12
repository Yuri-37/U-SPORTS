import 'package:flutter/material.dart';

import '../theme/layout_tokens.dart';

/// A single season-stat tile: big value over a small caption.
///
/// Tiles share a minimum width and centre both lines so a row of them reads as
/// an aligned grid. Without that, each tile shrink-wraps to its own label and a
/// short value ("2") sits visibly off-centre above a long one ("Match wins").
class StatChip extends StatelessWidget {
  const StatChip({super.key, required this.label, required this.value, this.minWidth = 76});

  final String label;
  final String value;
  final double minWidth;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(minWidth: minWidth),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: LayoutTokens.chipBackground(context),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            value,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 10, color: LayoutTokens.mutedText(context)),
          ),
        ],
      ),
    );
  }
}
