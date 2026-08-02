import 'package:flutter/material.dart';

/// Bell + optional red count badge (verified student hub style; works in light / dark).
class NotificationBellIconButton extends StatelessWidget {
  const NotificationBellIconButton({
    super.key,
    required this.badgeCount,
    required this.onPressed,
  });

  final int badgeCount;
  final VoidCallback onPressed;

  static const Color _badgeRed = Color(0xFFE53935);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bellColor = scheme.primary;

    final label = badgeCount > 99 ? '99+' : '$badgeCount';

    return IconButton(
      tooltip: 'Notifications',
      onPressed: onPressed,
      icon: Badge(
        isLabelVisible: badgeCount > 0,
        backgroundColor: _badgeRed,
        textColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        label: Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: Colors.white,
            height: 1,
          ),
        ),
        child: Icon(
          Icons.notifications_rounded,
          size: 26,
          color: bellColor,
        ),
      ),
    );
  }
}
