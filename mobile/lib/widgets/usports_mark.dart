import 'package:flutter/material.dart';

/// The U-Sports logo: a white "U" on a blue tile -- the same artwork as the app
/// icon and the website's tab icon. It is the product's own mark and is shown
/// next to, never instead of, the school's crest (which comes from the
/// institution profile and is shown smaller).
class UsportsMark extends StatelessWidget {
  const UsportsMark({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: 'U-Sports logo',
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.22),
        child: Image.asset(
          'assets/icons/app_icon.png',
          width: size,
          height: size,
          fit: BoxFit.cover,
          // Decode near the shown size instead of the 1024px original.
          cacheWidth: (size * 3).round(),
        ),
      ),
    );
  }
}
