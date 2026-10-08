import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/privacy_notice_content.dart';
import 'ui/brand_page.dart';

/// The privacy notice for people browsing without an account.
///
/// A signed-in user meets the full notice at PrivacyNoticeScreen and their
/// acceptance is stored on their profile. A guest has no profile to store it
/// on, so this is an acknowledgement kept on the device — which is also what
/// the notice itself says.
///
/// Sits in the page rather than blocking it: a tap on a shared event link
/// should still land on that event.
class GuestPrivacyNotice extends StatefulWidget {
  const GuestPrivacyNotice({super.key});

  static const _key = 'usports.guest.privacyAck';
  // Bump when the notice changes materially, so guests are shown it again.
  static const _version = '2026-10';

  @override
  State<GuestPrivacyNotice> createState() => _GuestPrivacyNoticeState();
}

class _GuestPrivacyNoticeState extends State<GuestPrivacyNotice> {
  // Starts hidden so the card never flashes for someone who already
  // acknowledged it; the stored value is read one frame later.
  bool _show = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final seen = prefs.getString(GuestPrivacyNotice._key) == GuestPrivacyNotice._version;
    if (mounted && !seen) setState(() => _show = true);
  }

  Future<void> _acknowledge() async {
    setState(() => _show = false);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(GuestPrivacyNotice._key, GuestPrivacyNotice._version);
  }

  @override
  Widget build(BuildContext context) {
    if (!_show) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SheetGroup(
        // SheetGroup draws a divider between its children; this card is one
        // block of text and its buttons, not a list of rows.
        dividers: false,
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.privacy_tip_outlined, size: 20, color: AppTheme.brandInk(context)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  kGuestPrivacySummary,
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
                  onPressed: () => context.push('/privacy-notice?readonly=true'),
                  child: const Text('Read notice'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: _acknowledge,
                  child: const Text('I understand'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
