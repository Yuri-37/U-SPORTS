import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';
import '../utils/sport_helpers.dart';
import 'ui/brand_page.dart';

/// One event as a list row: tinted sport tile, name and format, status pill.
class EventCard extends StatelessWidget {
  const EventCard({
    super.key,
    required this.event,
    this.onTap,
    this.hubCompact = false,
  });

  final Map<String, dynamic> event;
  final VoidCallback? onTap;

  /// Home-screen variant: name and format only (no season or description).
  final bool hubCompact;

  @override
  Widget build(BuildContext context) {
    final name = event['name'] as String? ?? 'Event';
    final sport = event['sport'] as String? ?? '';
    final status = event['status'] as String? ?? '';
    final desc = event['description'] as String?;
    final season = event['season'] as Map<String, dynamic>?;
    final seasonName = season?['name'] as String?;
    final formatLine = formatEnumLabel(event['format'] as String? ?? '');
    final muted = LayoutTokens.mutedText(context);
    final b = Theme.of(context).brightness;

    return Container(
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.cardShadow(b),
        border: b == Brightness.dark ? Border.all(color: LayoutTokens.borderSubtle(context)) : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconTile(icon: sportIcon(sport), color: sportTint(context, sport)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          height: 1.25,
                          color: LayoutTokens.primaryText(context),
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        hubCompact ? formatLine : '${sportLabel(sport)} · $formatLine',
                        style: TextStyle(fontSize: 12.5, color: muted),
                      ),
                      if (!hubCompact && seasonName != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(seasonName, style: TextStyle(fontSize: 12, color: muted)),
                        ),
                      if (!hubCompact && desc != null && desc.trim().isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            desc.trim(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, color: LayoutTokens.secondaryText(context)),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                StatusPill(status: status),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Event lifecycle pill. Ongoing reads as live (red ink); everything else in
/// the brand ink. Both use a tint of their own color, never a vivid fill.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final ongoing = status == 'in_progress';
    final c = ongoing ? LayoutTokens.danger(context) : AppTheme.brandInk(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        eventPublicLifecycleLabel(status),
        style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: c),
      ),
    );
  }
}

void openEventDetail(BuildContext context, String eventId) {
  context.push('/events/$eventId');
}
