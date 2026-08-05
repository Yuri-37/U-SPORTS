import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/events_api_provider.dart';
import '../theme/layout_tokens.dart';

/// A few headline match stats per sport, mirroring the "highlight" philosophy
/// already used for season stats (see sport_helpers.dart's
/// seasonStatHighlights) rather than the full per-sport column set web's
/// organizer review table shows — a 14-column basketball table doesn't fit a
/// phone. Keys match apps/web/src/lib/matchStatKeys.ts's raw (non-averaged)
/// per-match fields.
List<({String label, String key})> _highlightKeys(String sport) {
  switch (sport) {
    case 'basketball':
      return const [
        (label: 'PTS', key: 'total_points'),
        (label: 'REB', key: 'total_rebounds'),
        (label: 'AST', key: 'total_assists'),
      ];
    case 'volleyball':
      return const [
        (label: 'PTS', key: 'pts_scored'),
        (label: 'Kills', key: 'kills'),
        (label: 'Digs', key: 'digs'),
      ];
    case 'table-tennis':
      return const [
        (label: 'PTS', key: 'pts_scored'),
        (label: 'Winners', key: 'winners'),
      ];
    default:
      return const [];
  }
}

/// Roster (live + completed matches) and headline per-player stats
/// (completed only — the server zeroes `stats` itself for anything not
/// completed, see apps/server/src/routes/scoring.ts's /:matchId/roster).
class MatchRosterStats extends ConsumerWidget {
  const MatchRosterStats({super.key, required this.matchId, required this.sport, required this.nameA, required this.nameB});

  final String matchId;
  final String sport;
  final String nameA;
  final String nameB;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(matchRosterProvider(matchId));
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        final match = data['match'] as Map<String, dynamic>?;
        final status = match?['status'] as String? ?? '';
        if (status != 'live' && status != 'completed') return const SizedBox.shrink();

        final playerStats = (data['playerStats'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        if (playerStats.isEmpty) return const SizedBox.shrink();

        final showStats = status == 'completed';
        final sideA = playerStats.where((p) => p['participant_side'] == 'a').toList();
        final sideB = playerStats.where((p) => p['participant_side'] == 'b').toList();
        final highlights = _highlightKeys(sport);

        return Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: LayoutTokens.cardBackground(context),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: LayoutTokens.borderSubtle(context)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Roster', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: LayoutTokens.secondaryText(context))),
                const SizedBox(height: 12),
                _TeamRoster(label: nameA, players: sideA, highlights: highlights, showStats: showStats),
                const SizedBox(height: 16),
                _TeamRoster(label: nameB, players: sideB, highlights: highlights, showStats: showStats),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TeamRoster extends StatelessWidget {
  const _TeamRoster({required this.label, required this.players, required this.highlights, required this.showStats});

  final String label;
  final List<Map<String, dynamic>> players;
  final List<({String label, String key})> highlights;
  final bool showStats;

  @override
  Widget build(BuildContext context) {
    if (players.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: LayoutTokens.mutedText(context)),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 6),
        ...players.map((p) {
          final athlete = p['athlete'] as Map<String, dynamic>?;
          final profile = athlete?['profile'] as Map<String, dynamic>?;
          final name = (profile?['full_name'] as String?)?.trim();
          final displayName = (name != null && name.isNotEmpty) ? name : 'Athlete';
          final stats = (p['stats'] as Map?)?.cast<String, dynamic>() ?? const {};

          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(displayName, style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurface)),
                ),
                if (showStats && highlights.isNotEmpty)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: highlights.map((h) {
                      final value = (stats[h.key] as num?)?.toInt() ?? 0;
                      return Padding(
                        padding: const EdgeInsets.only(left: 10),
                        child: Text(
                          '${h.label} $value',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: LayoutTokens.secondaryText(context)),
                        ),
                      );
                    }).toList(),
                  ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
