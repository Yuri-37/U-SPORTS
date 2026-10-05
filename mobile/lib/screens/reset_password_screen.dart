import 'package:flutter/material.dart';
import '../utils/feedback.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/layout_tokens.dart';
import '../utils/error_helpers.dart';
import '../utils/password_validation.dart';
import '../widgets/ui/brand_page.dart';

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
      showSuccess(context, 'Password updated — sign in with your new password');
      Future.delayed(const Duration(milliseconds: 1800), () {
        if (mounted) context.go('/auth/login');
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = friendlyError(e, authActionLabel: 'Updating your password'));
      showError(context, _error!);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasSession = Supabase.instance.client.auth.currentSession != null;

    return BrandPage.fixed(
      title: 'Reset password',
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_done)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: LayoutTokens.success(context).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: LayoutTokens.success(context).withValues(alpha: 0.3)),
                ),
                child: Text(
                  'Password updated. Redirecting you to sign in with your new password…',
                  style: TextStyle(color: LayoutTokens.success(context), fontSize: 13.5, height: 1.5),
                ),
              )
            else if (!hasSession)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: LayoutTokens.danger(context).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: LayoutTokens.danger(context).withValues(alpha: 0.3)),
                ),
                child: Text(
                  'This reset link is invalid or has expired. Request a new one from the forgot password screen.',
                  style: TextStyle(color: LayoutTokens.danger(context), fontSize: 13.5, height: 1.5),
                ),
              )
            else ...[
              Text(
                'Choose a new password for your account.',
                style: TextStyle(fontSize: 14, color: LayoutTokens.secondaryText(context)),
              ),
              const SizedBox(height: 22),
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(14),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: LayoutTokens.danger(context).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: LayoutTokens.danger(context).withValues(alpha: 0.3)),
                  ),
                  child: Text(_error!, style: TextStyle(color: LayoutTokens.danger(context), fontSize: 13)),
                ),
              TextField(
                controller: _passCtrl,
                obscureText: !_showPassword,
                maxLength: 128,
                decoration: const InputDecoration(
                  labelText: 'New password',
                  counterText: '', // hard cap, not a visible counter -- matches web's silent maxLength
                  prefixIcon: Icon(Icons.lock_outline, size: 20),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirmCtrl,
                obscureText: !_showPassword,
                maxLength: 128,
                decoration: const InputDecoration(
                  labelText: 'Confirm new password',
                  counterText: '',
                  prefixIcon: Icon(Icons.lock_outline, size: 20),
                ),
              ),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: () => setState(() => _showPassword = !_showPassword),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      size: 18,
                      color: LayoutTokens.mutedText(context),
                    ),
                    const SizedBox(width: 6),
                    Text('Show password', style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(context))),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Theme.of(context).colorScheme.onPrimary,
                          ),
                        )
                      : const Text('Update password'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
