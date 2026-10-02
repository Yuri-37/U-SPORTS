import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/notifications_provider.dart';
import '../notification_bell_icon_button.dart';
import 'brand_page.dart';

/// Header actions shared by the Home, Rankings and Events tabs: guests get
/// Settings; athletes get notifications and their own settings. Was copied
/// into each of those screens separately.
class HubHeaderActions extends ConsumerWidget {
  const HubHeaderActions({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider).valueOrNull;
    final role = profile?.role ?? 'guest';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (role == 'guest')
          HeroIconButton(
            tooltip: 'Settings',
            icon: Icons.settings_outlined,
            onPressed: () => context.push('/settings'),
          ),
        if (role == 'athlete')
          profile != null && profile.isAthlete
              ? NotificationBellIconButton(
                  badgeCount: ref.watch(athleteNotificationBadgeCountProvider),
                  onPressed: () => context.push('/notifications'),
                )
              : HeroIconButton(
                  tooltip: 'Notifications',
                  icon: Icons.notifications_outlined,
                  onPressed: () => context.push('/notifications'),
                ),
        if (role == 'athlete')
          HeroIconButton(
            tooltip: 'Settings',
            icon: Icons.settings_outlined,
            onPressed: () => context.push('/athlete/settings'),
          ),
      ],
    );
  }
}
