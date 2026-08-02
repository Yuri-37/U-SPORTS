import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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

    return Material(
      color: LayoutTokens.cardBackground(context),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onWatch,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.danger.withValues(alpha: 0.45)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('LIVE', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w900, fontSize: 11)),
                  ),
                  const Spacer(),
                  Text(sportLabel(sport), style: TextStyle(fontSize: 10, color: LayoutTokens.mutedText(context), letterSpacing: 0.5)),
                ],
              ),
              const SizedBox(height: 6),
              Text(evName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(context))),
              if (pres.phase.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text(pres.phase, style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)))),
                      if (onWatch != null)
                        const Text('Details →', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.accent)),
                    ],
                  ),
                ),
              Text(nameA, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('${pres.left}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('VS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: LayoutTokens.mutedText(context))),
                    ),
                    Text('${pres.right}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: Text(nameB, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              ),
              if (pres.subtitle.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(pres.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, color: LayoutTokens.mutedText(context))),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

void openGuestAthlete(BuildContext context, String athleteId) {
  context.push('/athletes/$athleteId');
}
