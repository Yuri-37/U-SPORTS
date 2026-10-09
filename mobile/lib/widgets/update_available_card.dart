import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/app_update.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import 'ui/brand_page.dart';

/// "A newer version is available" -- shown on Home when the installed app is
/// behind the latest release. Opens the APK download in the browser; "Later"
/// hides it for that version only, so the next release is announced again.
class UpdateAvailableCard extends ConsumerWidget {
  const UpdateAvailableCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final update = ref.watch(appUpdateProvider).valueOrNull;
    if (update == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SheetGroup(
        dividers: false,
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.system_update_alt_rounded, size: 20, color: AppTheme.brandInk(context)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Version ${update.version} is available. Update to get the latest fixes and features.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.5,
                    color: LayoutTokens.secondaryText(context),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    await dismissAppUpdate(update.version);
                    ref.invalidate(appUpdateProvider);
                  },
                  child: const Text('Later'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: () => launchUrl(
                    Uri.parse(update.downloadUrl),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: const Text('Update'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
