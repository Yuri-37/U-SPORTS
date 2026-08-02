import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';

class _StrengthResult {
  const _StrengthResult(this.label, this.color, this.fraction);
  final String label;
  final Color color;
  final double fraction;
}

_StrengthResult? _score(BuildContext context, String password) {
  if (password.isEmpty) return null;

  var points = 0;
  if (password.length >= 8) points++;
  if (password.length >= 12) points++;
  if (RegExp(r'[A-Z]').hasMatch(password)) points++;
  if (RegExp(r'[0-9]').hasMatch(password)) points++;
  if (RegExp(r'[^A-Za-z0-9]').hasMatch(password)) points++;

  if (points <= 1) return const _StrengthResult('Weak', AppTheme.danger, 0.25);
  if (points == 2) return const _StrengthResult('Fair', AppTheme.warning, 0.5);
  if (points == 3) return const _StrengthResult('Good', AppTheme.accent, 0.75);
  return _StrengthResult('Strong', LayoutTokens.success(context), 1.0);
}

/// Mirrors the web `PasswordStrengthMeter` (same length/complexity heuristic).
class PasswordStrengthMeter extends StatelessWidget {
  const PasswordStrengthMeter({super.key, required this.password});

  final String password;

  @override
  Widget build(BuildContext context) {
    final result = _score(context, password);
    if (result == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: result.fraction,
              minHeight: 4,
              backgroundColor: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.3),
              valueColor: AlwaysStoppedAnimation<Color>(result.color),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            result.label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: result.color),
          ),
        ],
      ),
    );
  }
}
