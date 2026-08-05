import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/hub_live_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/live_match_presentation.dart';
import '../utils/participant_labels.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';

/// Live hub detail sheet — watches [hubLiveProvider] so scores update as super admin scores.
void showHubLiveMatchSheet(BuildContext context, {required String matchId}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: LayoutTokens.cardBackground(context),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      return Consumer(
        builder: (context, ref, _) {
          final async = ref.watch(hubLiveProvider);
          return async.when(
            loading: () => Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: const Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(24),
              child: Text(friendlyError(e)),
            ),
            data: (snap) {
              Map<String, dynamic>? match;
              for (final x in snap.matches) {
                if (x['id'] == matchId) {
                  match = x;
                  break;
                }
              }
              if (match == null) {
                return Padding(
                  padding: EdgeInsets.only(
                    left: 20,
                    right: 20,
                    top: 24,
                    bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'This match is no longer live on the hub.',
                        style: TextStyle(fontSize: 14, color: LayoutTokens.secondaryText(ctx)),
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Close'),
                      ),
                    ],
                  ),
                );
              }

              final event = match['event'] as Map<String, dynamic>?;
              final sport = event?['sport'] as String? ?? 'basketball';
              final evName = event?['name'] as String? ?? 'Live match';
              final aId = match['participant_a_id'] as String?;
              final bId = match['participant_b_id'] as String?;
              final picked = pickScoresForMatch(aId, bId, match['scores'] as List<dynamic>?);
              final period = snap.periodByMatch[matchId] ?? 1;
              final pres = liveScorePresentation(sport, picked.sa, picked.sb, period);
              final labels = snap.participantLabels;
              final nameA = participantDisplayLabel(labels, aId, fallbackPrefix: 'Side');
              final nameB = participantDisplayLabel(labels, bId, fallbackPrefix: 'Side');
              final venue = (match['venue'] as String?)?.trim();
              final eventId = match['event_id'] as String?;

              return SingleChildScrollView(
                child: Padding(
                  padding: EdgeInsets.only(
                    left: 20,
                    right: 20,
                    top: 16,
                    bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: LayoutTokens.borderSubtle(ctx),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(evName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppTheme.danger.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'LIVE',
                              style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w900, fontSize: 11),
                            ),
                          ),
                          Text(sportLabel(sport), style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(ctx))),
                          if (pres.phase.isNotEmpty) ...[
                            Text('·', style: TextStyle(color: LayoutTokens.mutedText(ctx))),
                            Text(pres.phase, style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(ctx))),
                          ],
                        ],
                      ),
                      if (venue != null && venue.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(venue, style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(ctx))),
                      ],
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Theme.of(ctx).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: LayoutTokens.borderSubtle(ctx)),
                        ),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('Home', style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(ctx))),
                                      const SizedBox(height: 4),
                                      Text(nameA, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                    ],
                                  ),
                                ),
                                Text(
                                  '${pres.left}',
                                  style: TextStyle(
                                    fontSize: 32,
                                    fontWeight: FontWeight.w900,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                  ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8),
                                  child: Text('—', style: TextStyle(color: LayoutTokens.mutedText(ctx))),
                                ),
                                Text(
                                  '${pres.right}',
                                  style: TextStyle(
                                    fontSize: 32,
                                    fontWeight: FontWeight.w900,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                  ),
                                ),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text('Away', style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(ctx))),
                                      const SizedBox(height: 4),
                                      Text(
                                        nameB,
                                        textAlign: TextAlign.end,
                                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (pres.subtitle.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                pres.subtitle,
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(ctx)),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Updating live from the scoreboard.',
                        style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(ctx)),
                      ),
                      const SizedBox(height: 16),
                      if (eventId != null)
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: () {
                              Navigator.pop(ctx);
                              GoRouter.of(ctx).push('/events/$eventId');
                            },
                            child: const Text('Event page'),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      );
    },
  );
}
