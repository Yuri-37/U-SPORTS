import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';

class HubDismissibleAlert extends StatelessWidget {
  const HubDismissibleAlert({
    super.key,
    required this.message,
    required this.tone,
    required this.onDismiss,
  });

  final String message;
  final AlertTone tone;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final (bg, border, icon, iconColor) = switch (tone) {
      AlertTone.warning => (
          AppTheme.warning.withValues(alpha: 0.12),
          AppTheme.warning.withValues(alpha: 0.35),
          Icons.info_outline,
          AppTheme.warning,
        ),
      AlertTone.success => (
          LayoutTokens.success(context).withValues(alpha: 0.12),
          LayoutTokens.success(context).withValues(alpha: 0.35),
          Icons.check_circle_outline,
          LayoutTokens.success(context),
        ),
      AlertTone.danger => (
          AppTheme.danger.withValues(alpha: 0.12),
          AppTheme.danger.withValues(alpha: 0.35),
          Icons.error_outline,
          AppTheme.danger,
        ),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurface,
                height: 1.35,
              ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            icon: Icon(Icons.close, size: 18, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.65)),
            onPressed: onDismiss,
            tooltip: 'Close and do not show again',
          ),
        ],
      ),
    );
  }
}

enum AlertTone { warning, success, danger }
