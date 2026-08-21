import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/error_helpers.dart';
import '../utils/password_validation.dart';

/// Reached only via the password-reset deep link (usports://reset-password)
/// — main.dart's link listener already calls getSessionFromUrl and establishes
/// the recovery session before navigating here, so by the time this screen
/// mounts there's either a valid session or the link was invalid/expired.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});
  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showPassword = false;
  bool _loading = false;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final password = _passCtrl.text;
    final passwordError = passwordValidationError(password);
    if (passwordError != null) {
      setState(() => _error = passwordError);
      return;
    }
    if (password != _confirmCtrl.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await Supabase.instance.client.auth
          .updateUser(UserAttributes(password: password));
      if (!mounted) return;
      // The recovery session is transient — sign out and send them to a
      // normal login with the new password.
      await Supabase.instance.client.auth.signOut();
      if (!mounted) return;
      setState(() => _done = true);
      Future.delayed(const Duration(milliseconds: 1800), () {
        if (mounted) context.go('/auth/login');
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = friendlyError(e, authActionLabel: 'Updating your password'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final hasSession = Supabase.instance.client.auth.currentSession != null;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_done)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: LayoutTokens.success(context).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color:
                            LayoutTokens.success(context).withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    'Password updated. Redirecting you to sign in with your new password…',
                    style: TextStyle(
                        color: LayoutTokens.success(context), fontSize: 13),
                  ),
                )
              else if (!hasSession)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: AppTheme.danger.withValues(alpha: 0.3)),
                  ),
                  child: const Text(
                    'This reset link is invalid or has expired. Request a new one from the forgot password screen.',
                    style: TextStyle(color: AppTheme.danger, fontSize: 13),
                  ),
                )
              else ...[
                Text(
                  'Choose a new password for your account.',
                  style: TextStyle(
                      fontSize: 14, color: LayoutTokens.secondaryText(context)),
                ),
                const SizedBox(height: 22),
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: AppTheme.danger.withValues(alpha: 0.3)),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(
                            color: AppTheme.danger, fontSize: 13)),
                  ),
                TextField(
                  controller: _passCtrl,
                  obscureText: !_showPassword,
                  maxLength: 128,
                  style: TextStyle(color: onSurface),
                  decoration: InputDecoration(
                    labelText: 'New password',
                    counterText: '', // hard cap, not a visible counter -- matches web's silent maxLength
                    prefixIcon: Icon(Icons.lock_outline,
                        color: LayoutTokens.secondaryText(context)),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirmCtrl,
                  obscureText: !_showPassword,
                  maxLength: 128,
                  style: TextStyle(color: onSurface),
                  decoration: InputDecoration(
                    labelText: 'Confirm new password',
                    counterText: '',
                    prefixIcon: Icon(Icons.lock_outline,
                        color: LayoutTokens.secondaryText(context)),
                  ),
                ),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: () => setState(() => _showPassword = !_showPassword),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _showPassword
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 20,
                        color: LayoutTokens.secondaryText(context),
                      ),
                      const SizedBox(width: 8),
                      Text('Show password',
                          style: TextStyle(
                              fontSize: 13,
                              color: LayoutTokens.secondaryText(context))),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Update password',
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
