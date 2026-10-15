import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// A person's photo, or their first initial on the school's colours when they
/// have none. Used in every list that shows an athlete, so a new photo shows
/// up everywhere.
class PersonAvatar extends StatelessWidget {
  const PersonAvatar({super.key, required this.name, this.imageUrl, this.size = 28});

  final String name;
  final String? imageUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    final initial = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: AppTheme.schoolPrimary, shape: BoxShape.circle),
      child: Text(
        initial,
        style: TextStyle(color: AppTheme.accentOnPrimary(), fontWeight: FontWeight.w800, fontSize: size * 0.42, height: 1),
      ),
    );
    if (url == null || url.isEmpty) return fallback;
    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        // Decode near the shown size.
        memCacheWidth: (size * 3).round(),
        placeholder: (_, __) => fallback,
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}
