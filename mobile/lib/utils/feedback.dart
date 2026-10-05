import 'package:flutter/material.dart';

import '../theme/layout_tokens.dart';
import 'error_helpers.dart';

/// One look for "did my save work?" across the app: a green check or a red
/// cross in a floating snackbar. Call it after every save, update or delete.
void _show(BuildContext context, String message, {required bool ok}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  final color = ok ? LayoutTokens.success(context) : LayoutTokens.danger(context);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: color,
        duration: Duration(seconds: ok ? 3 : 5),
        content: Row(
          children: [
            Icon(ok ? Icons.check_circle_rounded : Icons.error_rounded, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
}

void showSuccess(BuildContext context, String message) => _show(context, message, ok: true);

void showError(BuildContext context, String message) => _show(context, message, ok: false);

/// Failure with the plain-language wording from [friendlyError] (the server's
/// own sentence for a refused action, never a raw exception).
void showFailure(BuildContext context, Object error, {String? fallback}) {
  final text = friendlyError(error);
  _show(context, text == 'Something went wrong. Please try again.' ? (fallback ?? text) : text, ok: false);
}
