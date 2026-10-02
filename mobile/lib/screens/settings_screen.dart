import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/appearance_provider.dart';
import '../services/push_notifications_service.dart';
import '../theme/layout_tokens.dart';
import '../widgets/change_password_section.dart';
import '../widgets/delete_account_tile.dart';
import '../widgets/ui/brand_page.dart';

enum SettingsShell { guest, athlete, coach }

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key, required this.shell});

  final SettingsShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(appearanceDarkModeProvider);
    final title = switch (shell) {
      SettingsShell.guest => 'Settings',
      SettingsShell.athlete => 'Athlete settings',
      SettingsShell.coach => 'Coach settings',
    };

    return BrandPage.fixed(
      title: title,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          const SectionHeader(title: 'Appearance', padding: EdgeInsets.only(bottom: 12)),
          SheetGroup(
            children: [
              SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                title: const Text('Dark mode', style: TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Easier on the eyes in low light'),
                value: dark,
                onChanged: (_) => ref.read(appearanceDarkModeProvider.notifier).toggle(),
              ),
            ],
          ),
          if (shell == SettingsShell.guest) ...[
            const SectionHeader(title: 'Account', padding: EdgeInsets.fromLTRB(4, 24, 4, 12)),
            SheetGroup(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  "You're browsing as a guest. Sign in to see your stats, schedule and team.",
                  style: TextStyle(fontSize: 13.5, height: 1.5, color: LayoutTokens.secondaryText(context)),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => context.push('/auth/login'),
                    icon: const Icon(Icons.login_rounded, size: 20),
                    label: const Text('Sign In'),
                  ),
                ),
              ],
            ),
          ],
          // Signed-in users (athlete or coach) can change their own password.
          if (shell != SettingsShell.guest) ...[
            const SectionHeader(title: 'Security', padding: EdgeInsets.fromLTRB(4, 24, 4, 12)),
            const ChangePasswordSection(),
          ],
          if (shell != SettingsShell.guest) ...[
            const SectionHeader(title: 'Account', padding: EdgeInsets.fromLTRB(4, 24, 4, 12)),
            SheetGroup(
              children: [
                SheetTile(
                  leading: const IconTile(icon: Icons.privacy_tip_outlined),
                  title: 'Privacy notice',
                  trailing: Icon(Icons.chevron_right_rounded, size: 20, color: LayoutTokens.mutedText(context)),
                  onTap: () => context.push('/privacy-notice?readonly=true'),
                ),
                if (shell == SettingsShell.athlete) const DeleteAccountTile(),
                SheetTile(
                  leading: IconTile(icon: Icons.logout_rounded, color: LayoutTokens.danger(context)),
                  title: 'Sign out',
                  titleColor: LayoutTokens.danger(context),
                  onTap: () async {
                    await ref.read(pushNotificationsServiceProvider).unregisterToken();
                    await Supabase.instance.client.auth.signOut();
                    if (context.mounted) context.go('/');
                  },
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
