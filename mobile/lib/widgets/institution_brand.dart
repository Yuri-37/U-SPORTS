import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/institution_provider.dart';
import 'institution_logo.dart';
import 'usports_mark.dart';

/// Header brand: the U-Sports mark and name as the main identity, with the
/// school's crest and name smaller beneath -- parity with the web header.
class InstitutionBrandTitle extends ConsumerWidget {
  const InstitutionBrandTitle({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(institutionProvider);
    final markSize = compact ? 34.0 : 38.0;
    final titleStyle = Theme.of(context).appBarTheme.titleTextStyle?.copyWith(
          fontSize: compact ? 17 : 19,
          height: 1.05,
        );

    // Used while the school profile loads or if it can't be read: the product
    // identity alone is still a complete header.
    Widget productOnly() => Row(
          children: [
            UsportsMark(size: markSize),
            SizedBox(width: compact ? 9 : 11),
            Text('U-Sports', style: titleStyle),
          ],
        );

    return async.when(
      loading: productOnly,
      error: (_, __) => productOnly(),
      data: (ins) {
        if (ins == null) return productOnly();
        final logo = ins.logoUrl?.trim();
        final abbr = ins.abbreviation?.trim().isNotEmpty == true ? ins.abbreviation! : ins.name;
        final schoolLine = ins.name.trim().isNotEmpty ? ins.name : abbr;
        const crest = 14.0;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            UsportsMark(size: markSize),
            SizedBox(width: compact ? 9 : 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('U-Sports', maxLines: 1, overflow: TextOverflow.ellipsis, style: titleStyle),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (logo != null && logo.isNotEmpty) ...[
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxHeight: crest, maxWidth: 22),
                          child: InstitutionLogo(
                            url: logo,
                            height: crest,
                            alignment: Alignment.centerLeft,
                            fallback: const SizedBox.shrink(),
                          ),
                        ),
                        const SizedBox(width: 5),
                      ],
                      Flexible(
                        child: Text(
                          schoolLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withValues(alpha: 0.82),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
