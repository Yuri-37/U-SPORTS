import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Bell in a translucent circle, for the navy page hero. The unread count sits
/// in a gold badge -- the school's secondary color, readable on navy -- ringed
/// in the hero color so it reads as cut out of the button.
class NotificationBellIconButton extends StatelessWidget {
  const NotificationBellIconButton({
    super.key,
    required this.badgeCount,
    required this.onPressed,
  });

  final int badgeCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = badgeCount > 99 ? '99+' : '$badgeCount';

    return Tooltip(
      message: 'Notifications',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Material(
                color: Colors.white.withValues(alpha: 0.14),
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: onPressed,
                  child: const Center(
                    child: Icon(Icons.notifications_rounded, size: 22, color: Colors.white),
                  ),
                ),
              ),
              if (badgeCount > 0)
                Positioned(
                  right: -2,
                  top: -2,
                  child: IgnorePointer(
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppTheme.schoolSecondary,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: AppTheme.schoolPrimary, width: 2),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.schoolPrimary,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
