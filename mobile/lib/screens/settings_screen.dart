import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/appearance_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/change_password_section.dart';

enum SettingsShell { guest, athlete }

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key, required this.shell});

  final SettingsShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(appearanceDarkModeProvider);
    final title = switch (shell) {
      SettingsShell.guest => 'Settings',
      SettingsShell.athlete => 'Athlete settings',
    };

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Appearance', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          SwitchListTile(
            title: const Text('Dark mode'),
            subtitle: const Text('Easier on the eyes in low light'),
            value: dark,
            onChanged: (_) => ref.read(appearanceDarkModeProvider.notifier).toggle(),
          ),
          if (shell == SettingsShell.guest) ...[
            const Divider(height: 32),
            Text('Account', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              "You're browsing as a guest. Sign in to see your stats, schedule and team.",
              style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton.icon(
                onPressed: () => context.push('/auth/login'),
                icon: const Icon(Icons.login_rounded, size: 20),
                label: const Text('Sign In', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
          if (shell == SettingsShell.athlete) ...[
            const Divider(height: 32),
            Text('Security', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            const ChangePasswordSection(),
          ],
          if (shell != SettingsShell.guest) ...[
            const Divider(height: 32),
            Text('Account', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.logout, color: AppTheme.danger),
              title: const Text('Sign out', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w700)),
              onTap: () async {
                await Supabase.instance.client.auth.signOut();
                if (context.mounted) context.go('/');
              },
            ),
          ],
        ],
      ),
    );
  }
}
