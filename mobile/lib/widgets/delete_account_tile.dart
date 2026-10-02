import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/api_service.dart';
import '../services/push_notifications_service.dart';
import '../theme/layout_tokens.dart';
import '../utils/error_helpers.dart';
import 'ui/brand_page.dart';

/// Athlete-only "Delete my account" row (Data Privacy Act, right to erasure).
///
/// Asks for the current password first so a borrowed phone cannot erase an
/// account. Staff accounts are removed by the Super Admin, so this is only
/// shown in the athlete settings.
class DeleteAccountTile extends ConsumerWidget {
  const DeleteAccountTile({super.key});

  Future<void> _confirm(BuildContext context, WidgetRef ref) async {
    final deleted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _DeleteAccountDialog(),
    );
    if (deleted != true || !context.mounted) return;
    try {
      await ref.read(pushNotificationsServiceProvider).unregisterToken();
    } catch (_) {
      // The account is already gone; a stale device token is harmless.
    }
    await Supabase.instance.client.auth.signOut();
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Your account was deleted.')));
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SheetTile(
      leading: IconTile(icon: Icons.delete_forever_outlined, color: LayoutTokens.danger(context)),
      title: 'Delete my account',
      subtitle: 'Removes your profile, roster spots and stats',
      titleColor: LayoutTokens.danger(context),
      onTap: () => _confirm(context, ref),
    );
  }
}

class _DeleteAccountDialog extends ConsumerStatefulWidget {
  const _DeleteAccountDialog();

  @override
  ConsumerState<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends ConsumerState<_DeleteAccountDialog> {
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).postJson('/profile/delete-account', body: {'password': _password.text});
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = friendlyError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Delete your account?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This permanently removes your account, roster memberships, season statistics and '
              'notifications. It cannot be undone. Team results of events that already finished '
              'stay visible as historical records.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _password,
              obscureText: true,
              enabled: !_busy,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Enter your password to confirm'),
              onChanged: (_) => setState(() {}),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: LayoutTokens.danger(context))),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        TextButton(
          onPressed: _busy || _password.text.isEmpty ? null : _delete,
          style: TextButton.styleFrom(foregroundColor: LayoutTokens.danger(context)),
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Delete'),
        ),
      ],
    );
  }
}
