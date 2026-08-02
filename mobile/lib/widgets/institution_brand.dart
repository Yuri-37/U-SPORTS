import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/institution_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';

/// Header row: school logo (or initials) + abbreviation + tagline — parity with web [GuestLayout].
class InstitutionBrandTitle extends ConsumerWidget {
  const InstitutionBrandTitle({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(institutionProvider);
    return async.when(
      loading: () => Text(compact ? 'U-Sports' : 'U-Sports Hub', style: Theme.of(context).appBarTheme.titleTextStyle),
      error: (_, __) => Text(compact ? 'U-Sports' : 'U-Sports Hub', style: Theme.of(context).appBarTheme.titleTextStyle),
      data: (ins) {
        if (ins == null) {
          return Text(compact ? 'U-Sports' : 'U-Sports Hub', style: Theme.of(context).appBarTheme.titleTextStyle);
        }
        final logo = ins.logoUrl?.trim();
        final abbr = ins.abbreviation?.trim().isNotEmpty == true ? ins.abbreviation! : ins.name;
        final h = compact ? 28.0 : 32.0;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (logo != null && logo.isNotEmpty)
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: h, maxWidth: compact ? 80 : 104),
                  child: CachedNetworkImage(
                    imageUrl: logo,
                    height: h,
                    fit: BoxFit.contain,
                    alignment: Alignment.centerLeft,
                    placeholder: (_, __) => SizedBox(height: h, width: h),
                    errorWidget: (_, __, ___) => _AbbrBadge(abbr: abbr, size: h),
                  ),
                ),
              )
            else
              _AbbrBadge(abbr: abbr, size: h),
            SizedBox(width: compact ? 8 : 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    ins.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).appBarTheme.titleTextStyle?.copyWith(
                      fontSize: compact ? 15 : 17,
                      height: 1.05,
                    ),
                  ),
                  if (!compact && ins.tagline != null && ins.tagline!.isNotEmpty)
                    Text(
                      ins.tagline!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10,
                        color: LayoutTokens.secondaryText(context),
                      ),
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

class _AbbrBadge extends StatelessWidget {
  const _AbbrBadge({required this.abbr, required this.size});

  final String abbr;
  final double size;

  @override
  Widget build(BuildContext context) {
    final two = abbr.length >= 2 ? abbr.substring(0, 2).toUpperCase() : abbr.toUpperCase();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppTheme.schoolPrimary,
        borderRadius: BorderRadius.circular(size / 2),
      ),
      child: Text(
        two,
        style: TextStyle(
          fontSize: size * 0.35,
          fontWeight: FontWeight.w800,
          color: AppTheme.schoolSecondary,
        ),
      ),
    );
  }
}
