import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';
import '../utils/sport_helpers.dart';

class EventCard extends StatelessWidget {
  const EventCard({
    super.key,
    required this.event,
    this.onTap,
    this.hubCompact = false,
  });

  final Map<String, dynamic> event;
  final VoidCallback? onTap;
  /// Web guest hub style: icon + status badge row, title, format only (no season/description).
  final bool hubCompact;

  @override
  Widget build(BuildContext context) {
    final name = event['name'] as String? ?? 'Event';
    final sport = event['sport'] as String? ?? '';
    final status = event['status'] as String? ?? '';
    final desc = event['description'] as String?;
    final season = event['season'] as Map<String, dynamic>?;
    final seasonName = season?['name'] as String?;

    final badgeLabel = eventPublicLifecycleLabel(status);
    final isOngoing = status == 'in_progress';
    final badgeBg = isOngoing ? AppTheme.danger.withValues(alpha: 0.18) : AppTheme.accent.withValues(alpha: 0.15);
    final badgeFg = isOngoing ? AppTheme.danger : AppTheme.accent;
    final formatLine = formatEnumLabel(event['format'] as String? ?? '');

    return Material(
      color: LayoutTokens.cardBackground(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: LayoutTokens.borderSubtle(context)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (hubCompact) ...[
                Row(
                  children: [
                    Text(sportEmoji(sport), style: const TextStyle(fontSize: 22)),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        badgeLabel,
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: badgeFg),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, height: 1.25),
                ),
                const SizedBox(height: 4),
                Text(
                  formatLine,
                  style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                ),
              ] else ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(sportEmoji(sport), style: const TextStyle(fontSize: 20)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        name,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        badgeLabel,
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: badgeFg),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${sportLabel(sport)} · $formatLine',
                  style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                ),
                if (seasonName != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(seasonName, style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(context))),
                  ),
                if (desc != null && desc.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      desc.trim(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

void openEventDetail(BuildContext context, String eventId) {
  context.push('/events/$eventId');
}
