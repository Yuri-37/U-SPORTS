import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/auth_provider.dart';
import '../providers/institution_provider.dart';
import '../services/push_notifications_service.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/error_helpers.dart';
import '../widgets/usports_mark.dart';
import '../widgets/ui/brand_page.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});
  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _emailCtrl.text.trim();
    final password = _passCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await Supabase.instance.client.auth.signInWithPassword(
        email: email,
        password: password,
      );
      if (!mounted) return;

      if (res.user == null) throw Exception('Login failed');

      final profile = await Supabase.instance.client
          .from('profiles')
          .select('role')
          .eq('id', res.user!.id)
          .maybeSingle();
      if (!mounted) return;
      final role = (profile?['role'] as String?)?.trim();

      // Admins and organizers must use the web platform — the app has no
      // scoring, bracket or account-management surface for them. Coaches are
      // signed in here and land on their own roster/schedule home.
      const webOnlyRoles = {
        'Admin',
        'Organizer',
        'super_admin',
        'organizer'
      };
      if (role != null && webOnlyRoles.contains(role)) {
        await ref.read(pushNotificationsServiceProvider).unregisterToken();
        await Supabase.instance.client.auth.signOut();
        if (!mounted) return;
        setState(() {
          _error = 'Organizer and Admin accounts must use the web platform.';
        });
        return;
      }

      if (role == 'Coach') {
        ref.invalidate(profileProvider);
        ref.invalidate(athleteRowProvider);
        if (!mounted) return;
        context.go('/coach/teams');
        return;
      }

      // Athlete identity is a row in `athletes` (role is NULL for athletes post-migration 037).
      final athlete = await Supabase.instance.client
          .from('athletes')
          .select('id')
          .eq('profile_id', res.user!.id)
          .maybeSingle();
      if (!mounted) return;

      // Refresh providers so the synthesized role propagates immediately.
      ref.invalidate(profileProvider);
      ref.invalidate(athleteRowProvider);

      if (athlete != null) {
        context.go('/athlete/dashboard');
      } else {
        context.go('/');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = friendlyError(e);
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final institution = ref.watch(institutionProvider).valueOrNull;
    final hintDomain = institution?.studentEmailDomain ?? 'students.nu-dasma.edu.ph';
    final schoolName = institution?.name.trim() ?? '';

    // Reached via context.go(), which replaces the shell rather than pushing
    // on top of it, so there's nothing on the stack for the system back
    // button to pop — without this it exits the app. Send it Home instead.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        context.go('/');
      },
      child: BrandPage.scroll(
        showBack: false,
        hero: Column(
          children: [
            // Signing in is to U-Sports, so the screen carries the U-Sports
            // identity; the school is named quietly underneath.
            const UsportsMark(size: 76),
            const SizedBox(height: 16),
            Text('U-Sports', textAlign: TextAlign.center, style: AppTheme.display(size: 30, color: Colors.white)),
            if (schoolName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  schoolName,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 13.5),
                ),
              ),
          ],
        ),
        sheetPadding: const EdgeInsets.fromLTRB(20, 28, 20, 32),
        children: [
          Text('Sign In', style: AppTheme.display(size: 24, color: LayoutTokens.primaryText(context))),
          const SizedBox(height: 6),
          Text(
            'Access your U-Sports dashboard',
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
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(
              labelText: 'Email',
              hintText: 'yourname@$hintDomain',
              prefixIcon: const Icon(Icons.mail_outline, size: 20),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _passCtrl,
            obscureText: !_showPassword,
            decoration: const InputDecoration(
              labelText: 'Password',
              prefixIcon: Icon(Icons.lock_outline, size: 20),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
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
              GestureDetector(
                onTap: () => context.push('/auth/forgot-password'),
                child: Text(
                  'Forgot password?',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.brandInk(context)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _login,
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
                        Icon(Icons.login_rounded, size: 20),
                        SizedBox(width: 8),
                        Text('Sign In'),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: TextButton(
              onPressed: () => context.go('/'),
              child: const Text('Just browsing? View as Guest →'),
            ),
          ),
        ],
      ),
    );
  }
}
