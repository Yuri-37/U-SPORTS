import 'package:flutter/material.dart';

import '../theme/layout_tokens.dart';

class StatChip extends StatelessWidget {
  const StatChip({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: LayoutTokens.chipBackground(context),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 9, color: LayoutTokens.mutedText(context))),
        ],
      ),
    );
  }
}
