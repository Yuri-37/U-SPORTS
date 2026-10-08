import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/layout_tokens.dart';
import '../utils/email_typo.dart';
import '../utils/error_helpers.dart';
import '../widgets/ui/brand_page.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  bool _loading = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your email address.');
      return;
    }
    // A typo'd domain would "succeed" and send nothing -- stop and offer the fix.
    final fixed = suggestSchoolEmail(email);
    if (fixed != null) {
      setState(() {
        _error = 'That email address looks mistyped. Did you mean $fixed? It has been corrected below; tap Send reset link again.';
        _emailCtrl.text = fixed;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(
        email,
        redirectTo: 'usports://reset-password',
      );
      if (!mounted) return;
      // Always show success, even if the address doesn't exist — otherwise
      // this becomes a way to check which emails are registered.
      setState(() => _sent = true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = friendlyError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BrandPage.fixed(
      title: 'Forgot password',
      onBack: () => context.pop(),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_sent) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: LayoutTokens.success(context).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: LayoutTokens.success(context).withValues(alpha: 0.3)),
                ),
                child: Text(
                  'If an account exists for ${_emailCtrl.text.trim()}, a password reset link has been sent. Check your inbox (and spam folder) — it may take a few minutes. Only the newest reset email works: asking for another one cancels the link in any earlier email.',
                  style: TextStyle(color: LayoutTokens.success(context), fontSize: 13.5, height: 1.5),
                ),
              ),
              const SizedBox(height: 20),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/auth/login'),
                  child: const Text('Back to sign in'),
                ),
              ),
            ] else ...[
              Text(
                'Enter your email and we\'ll send you a link to reset your password. If your account was created without a working email on file, ask your organizer to reset it for you instead.',
                style: TextStyle(fontSize: 14, height: 1.5, color: LayoutTokens.secondaryText(context)),
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
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  hintText: 'yourname@nu-dasma.edu.ph',
                  prefixIcon: Icon(Icons.mail_outline, size: 20),
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
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.send_rounded, size: 20),
                            SizedBox(width: 8),
                            Text('Send reset link'),
                          ],
                        ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
