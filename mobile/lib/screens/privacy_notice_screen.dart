import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/push_notifications_service.dart';
import '../services/router.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/privacy_notice_content.dart';

/// Blocking (readOnly: false) — reached only via router.dart's redirect when
/// profile.privacyAcceptedAt is null; PopScope keeps it from being
/// back-gestured away, though redirect re-running on every nav attempt would
/// just bounce back here anyway.
/// Read-only (readOnly: true) — opened from Settings to review the notice
/// again later; no accept action, normal back navigation.
class PrivacyNoticeScreen extends ConsumerStatefulWidget {
  const PrivacyNoticeScreen({super.key, this.readOnly = false});
  final bool readOnly;

  @override
  ConsumerState<PrivacyNoticeScreen> createState() => _PrivacyNoticeScreenState();
}

class _PrivacyNoticeScreenState extends ConsumerState<PrivacyNoticeScreen> {
  bool _loading = false;
  String? _error;

  Future<void> _agree() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).postJson('/auth/accept-privacy-notice');
      ref.invalidate(profileProvider);
      ref.read(routerProvider).refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not save your response. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signOut() async {
    await ref.read(pushNotificationsServiceProvider).unregisterToken();
    await Supabase.instance.client.auth.signOut();
    if (mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return PopScope(
      canPop: widget.readOnly,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: widget.readOnly ? AppBar(title: const Text('Privacy Notice')) : null,
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    if (!widget.readOnly) ...[
                      const Icon(Icons.shield_outlined, size: 40, color: AppTheme.accent),
                      const SizedBox(height: 12),
                      Text(
                        'Your Privacy on U-Sports',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: onSurface,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    for (final section in kPrivacyNoticeSections)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (section.heading.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Text(
                                  section.heading,
                                  style: TextStyle(fontWeight: FontWeight.w700, color: onSurface),
                                ),
                              ),
                            Text(
                              section.body,
                              style: TextStyle(
                                fontSize: 13.5,
                                height: 1.4,
                                color: LayoutTokens.secondaryText(context),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              if (!widget.readOnly)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: Column(
                    children: [
                      if (_error != null)
                        Container(
                          padding: const EdgeInsets.all(12),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: AppTheme.danger.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
                          ),
                          child: Text(
                            _error!,
                            style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                          ),
                        ),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: FilledButton(
                          onPressed: _loading ? null : _agree,
                          child: _loading
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'I Agree — Continue',
                                  style: TextStyle(fontWeight: FontWeight.w700),
                                ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      TextButton(
                        onPressed: _loading ? null : _signOut,
                        child: const Text('Not ready? Sign out instead'),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
