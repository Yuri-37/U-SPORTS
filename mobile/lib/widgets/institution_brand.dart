import 'package:flutter/material.dart';

import 'usports_mark.dart';

/// Header brand: the U-Sports mark and name on a single line. The school's own
/// crest and name are shown once, in the home hero below -- repeating them here
/// as well is what made the top of the screen look crowded.
class InstitutionBrandTitle extends StatelessWidget {
  const InstitutionBrandTitle({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final markSize = compact ? 36.0 : 40.0;
    final titleStyle = Theme.of(context).appBarTheme.titleTextStyle?.copyWith(
          fontSize: compact ? 20 : 22,
          height: 1.05,
        );
    return Row(
      children: [
        UsportsMark(size: markSize),
        SizedBox(width: compact ? 10 : 12),
        Flexible(child: Text('U-Sports', maxLines: 1, overflow: TextOverflow.ellipsis, style: titleStyle)),
      ],
    );
  }
}
