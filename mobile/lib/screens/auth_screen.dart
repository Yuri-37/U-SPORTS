import 'package:cached_network_image/cached_network_image.dart';
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

      // Staff (Admin/Organizer/Coach — plus legacy super_admin/organizer) must use the web platform.
      const staffRoles = {
        'Admin',
        'Organizer',
        'Coach',
        'super_admin',
        'organizer'
      };
      if (role != null && staffRoles.contains(role)) {
        await ref.read(pushNotificationsServiceProvider).unregisterToken();
        await Supabase.instance.client.auth.signOut();
        if (!mounted) return;
        setState(() {
          _error = 'Organizer/Admin/Coach accounts must use the web platform.';
        });
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
    final institutionAsync = ref.watch(institutionProvider);
    final hintDomain = institutionAsync.valueOrNull?.studentEmailDomain ??
        'students.nu-dasma.edu.ph';

    final onSurface = Theme.of(context).colorScheme.onSurface;
    // Reached via context.go(), which replaces the shell rather than pushing
    // on top of it, so there's nothing on the stack for the system back
    // button to pop — without this it exits the app. Send it Home instead.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        context.go('/');
      },
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                institutionAsync.when(
                  data: (ins) {
                    if (ins == null) {
                      return Column(
                        children: [
                          Text(
                            'U-Sports',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 36,
                              fontWeight: FontWeight.w900,
                              color: Theme.of(context).colorScheme.onSurface,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Access your U-Sports dashboard',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                color: LayoutTokens.secondaryText(context),
                                fontSize: 14),
                          ),
                        ],
                      );
                    }
                    final logo = ins.logoUrl?.trim();
                    final abbr = (ins.abbreviation?.trim().isNotEmpty == true
                            ? ins.abbreviation!
                            : ins.name.length >= 2
                                ? ins.name.substring(0, 2)
                                : ins.name)
                        .toUpperCase();
                    return Column(
                      children: [
                        if (logo != null && logo.isNotEmpty)
                          // Full uncropped logo — BoxFit.contain never crops,
                          // unlike the .cover + circular clip this replaced.
                          CachedNetworkImage(
                            imageUrl: logo,
                            height: 72,
                            width: 120,
                            fit: BoxFit.contain,
                            placeholder: (_, __) =>
                                const SizedBox(height: 72, width: 120),
                            errorWidget: (_, __, ___) => CircleAvatar(
                              radius: 36,
                              backgroundColor:
                                  AppTheme.accent.withValues(alpha: 0.2),
                              child: Text(
                                abbr,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 18),
                              ),
                            ),
                          )
                        else
                          CircleAvatar(
                            radius: 36,
                            backgroundColor:
                                AppTheme.accent.withValues(alpha: 0.25),
                            child: Text(
                              abbr,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 18),
                            ),
                          ),
                        const SizedBox(height: 14),
                        Text(
                          'U-Sports',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5,
                              color: onSurface),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          ins.name,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 14,
                              color: LayoutTokens.secondaryText(context)),
                        ),
                      ],
                    );
                  },
                  loading: () => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (_, __) => Column(
                    children: [
                      Text(
                        'U-Sports',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.w900,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Access your U-Sports dashboard',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: LayoutTokens.secondaryText(context),
                            fontSize: 14),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Sign In',
                      style:
                          TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Access your U-Sports dashboard',
                    style: TextStyle(
                        fontSize: 14,
                        color: LayoutTokens.secondaryText(context)),
                  ),
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
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  style: TextStyle(color: onSurface),
                  decoration: InputDecoration(
                    labelText: 'Email',
                    hintText: 'yourname@$hintDomain',
                    prefixIcon: Icon(Icons.mail_outline,
                        color: LayoutTokens.secondaryText(context)),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passCtrl,
                  obscureText: !_showPassword,
                  style: TextStyle(color: onSurface),
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: Icon(Icons.lock_outline,
                        color: LayoutTokens.secondaryText(context)),
                  ),
                ),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: () => setState(() => _showPassword = !_showPassword),
                  child: Row(
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
                    onPressed: _loading ? null : _login,
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.login_rounded, size: 20),
                              SizedBox(width: 8),
                              Text('Sign In',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 18),
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/'),
                    child: Text(
                      'Just browsing? View as Guest →',
                      style: TextStyle(
                          fontSize: 14,
                          color: LayoutTokens.secondaryText(context)),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
