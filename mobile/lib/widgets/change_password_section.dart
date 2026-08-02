import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import 'password_strength_meter.dart';

/// Change-password card with a 7-day cooldown enforced server-side — mirrors
/// the web `ChangePasswordSection`. Include on the athlete Settings screen.
class ChangePasswordSection extends ConsumerStatefulWidget {
  const ChangePasswordSection({super.key});

  @override
  ConsumerState<ChangePasswordSection> createState() => _ChangePasswordSectionState();
}

class _ChangePasswordSectionState extends ConsumerState<ChangePasswordSection> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showPasswords = false;
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _success = null;
    });

    final current = _currentCtrl.text;
    final next = _newCtrl.text;
    final confirm = _confirmCtrl.text;

    if (current.isEmpty) {
      setState(() => _error = 'Enter your current password');
      return;
    }
    if (next.length < 8) {
      setState(() => _error = 'Password must be at least 8 characters');
      return;
    }
    if (next.length > 128) {
      setState(() => _error = 'Password is too long');
      return;
    }
    if (next != confirm) {
      setState(() => _error = 'New passwords do not match');
      return;
    }

    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).postJson(
        '/auth/change-password',
        body: {'currentPassword': current, 'newPassword': next},
      );
      if (!mounted) return;
      setState(() {
        _success = 'Password changed successfully.';
        _currentCtrl.clear();
        _newCtrl.clear();
        _confirmCtrl.clear();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Could not change password');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Material(
      color: LayoutTokens.cardBackground(context),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: LayoutTokens.borderSubtle(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Change password',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: onSurface),
            ),
            const SizedBox(height: 4),
            Text(
              'You can change your password once every 7 days.',
              style: TextStyle(fontSize: 12.5, color: LayoutTokens.secondaryText(context)),
            ),
            const SizedBox(height: 14),
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppTheme.danger.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
                ),
                child: Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
              ),
            if (_success != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: LayoutTokens.success(context).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: LayoutTokens.success(context).withValues(alpha: 0.3)),
                ),
                child: Text(_success!, style: TextStyle(color: LayoutTokens.success(context), fontSize: 13)),
              ),
            TextField(
              controller: _currentCtrl,
              obscureText: !_showPasswords,
              style: TextStyle(color: onSurface),
              decoration: const InputDecoration(
                labelText: 'Current password',
                prefixIcon: Icon(Icons.lock_outline),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newCtrl,
              obscureText: !_showPasswords,
              style: TextStyle(color: onSurface),
              decoration: const InputDecoration(
                labelText: 'New password',
                prefixIcon: Icon(Icons.lock_outline),
              ),
              onChanged: (_) => setState(() {}),
            ),
            PasswordStrengthMeter(password: _newCtrl.text),
            const SizedBox(height: 12),
            TextField(
              controller: _confirmCtrl,
              obscureText: !_showPasswords,
              style: TextStyle(color: onSurface),
              decoration: const InputDecoration(
                labelText: 'Confirm new password',
                prefixIcon: Icon(Icons.lock_outline),
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () => setState(() => _showPasswords = !_showPasswords),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _showPasswords ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    size: 18,
                    color: LayoutTokens.secondaryText(context),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _showPasswords ? 'Hide passwords' : 'Show passwords',
                    style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(context)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Update password', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
