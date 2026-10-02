import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/live_match_presentation.dart';
import '../utils/participant_labels.dart';
import '../utils/sport_helpers.dart';

class LiveMatchCard extends StatelessWidget {
  const LiveMatchCard({
    super.key,
    required this.match,
    required this.labels,
    required this.period,
    this.onWatch,
  });

  final Map<String, dynamic> match;
  final Map<String, String> labels;
  final int period;
  final VoidCallback? onWatch;

  @override
  Widget build(BuildContext context) {
    final event = match['event'] as Map<String, dynamic>?;
    final sport = event?['sport'] as String? ?? 'basketball';
    final evName = event?['name'] as String? ?? 'Live match';
    final aId = match['participant_a_id'] as String?;
    final bId = match['participant_b_id'] as String?;
    final nameA = participantDisplayLabel(labels, aId, fallbackPrefix: 'Side');
    final nameB = participantDisplayLabel(labels, bId, fallbackPrefix: 'Side');
    final picked = pickScoresForMatch(aId, bId, match['scores'] as List<dynamic>?);
    final pres = liveScorePresentation(sport, picked.sa, picked.sb, period);

    final ink = LayoutTokens.primaryText(context);
    final muted = LayoutTokens.mutedText(context);
    final live = LayoutTokens.danger(context);
    final b = Theme.of(context).brightness;

    final teamStyle = GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: ink, height: 1.25);
    final scoreStyle = AppTheme.display(size: 30, color: ink, height: 1);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
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
            onTap: onWatch,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(
                          color: live.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(width: 6, height: 6, decoration: BoxDecoration(color: live, shape: BoxShape.circle)),
                            const SizedBox(width: 5),
                            Text('LIVE', style: AppTheme.overline(live).copyWith(fontSize: 10.5, letterSpacing: 1)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          evName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12.5, color: muted, fontWeight: FontWeight.w500),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        sportLabel(sport),
                        style: TextStyle(fontSize: 11.5, color: LayoutTokens.secondaryText(context), fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  // Scoreboard: each team sits beside its own score.
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(child: Text(nameA, maxLines: 2, overflow: TextOverflow.ellipsis, style: teamStyle)),
                      const SizedBox(width: 8),
                      Text('${pres.left}', style: scoreStyle),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text('VS', style: AppTheme.overline(muted).copyWith(letterSpacing: 1)),
                      ),
                      Text('${pres.right}', style: scoreStyle),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(nameB, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.end, style: teamStyle),
                      ),
                    ],
                  ),
                  if (pres.phase.isNotEmpty || pres.subtitle.isNotEmpty || onWatch != null) ...[
                    const SizedBox(height: 14),
                    Divider(height: 1, color: LayoutTokens.borderSubtle(context)),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            [pres.phase, pres.subtitle].where((s) => s.isNotEmpty).join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: muted),
                          ),
                        ),
                        if (onWatch != null)
                          Text(
                            'Details →',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.brandInk(context),
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

void openGuestAthlete(BuildContext context, String athleteId) {
  context.push('/athletes/$athleteId');
}
