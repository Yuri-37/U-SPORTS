import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/connectivity_provider.dart';
import '../theme/app_theme.dart';

/// Persistent top banner shown whenever the device has no network
/// connection — U-Sports has no offline mode, every screen needs the API/
/// Supabase reachable. Meant to sit above [MaterialApp.router]'s `child` via
/// its `builder`, so it covers app startup and every route without each
/// screen wiring its own check.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(isOnlineProvider).valueOrNull ?? true;

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: AnimatedSlide(
        offset: online ? const Offset(0, -1) : Offset.zero,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
        child: const SafeArea(
          bottom: false,
          child: Material(
            color: AppTheme.danger,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  Icon(Icons.wifi_off_rounded, color: Colors.white, size: 18),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'No internet connection — U-Sports needs an active connection to work.',
                      style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
