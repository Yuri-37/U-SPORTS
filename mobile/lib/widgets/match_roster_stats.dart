import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/events_api_provider.dart';
import '../theme/layout_tokens.dart';

/// Mirrors apps/web/src/lib/matchStatKeys.ts exactly — same per-sport stat
/// columns as web's organizer review table and PublicRosterStats, so mobile
/// no longer shows a trimmed-down 3-stat subset of the same match data.
List<({String label, String key})> _statKeys(String sport) {
  switch (sport) {
    case 'basketball':
      return const [
        (label: 'PTS', key: 'total_points'),
        (label: 'FGM', key: 'fg_made'),
        (label: 'FGA', key: 'fg_attempted'),
        (label: '3PM', key: 'three_made'),
        (label: '3PA', key: 'three_attempted'),
        (label: 'FTM', key: 'ft_made'),
        (label: 'FTA', key: 'ft_attempted'),
        (label: 'REB', key: 'total_rebounds'),
        (label: 'OREB', key: 'off_rebounds'),
        (label: 'AST', key: 'total_assists'),
        (label: 'STL', key: 'total_steals'),
        (label: 'BLK', key: 'total_blocks'),
        (label: 'TO', key: 'turnovers'),
        (label: 'PF', key: 'fouls'),
      ];
    case 'volleyball':
      return const [
        (label: 'PTS', key: 'pts_scored'),
        (label: 'Kills', key: 'kills'),
        (label: 'Att', key: 'attacks'),
        (label: 'Aces', key: 'aces'),
        (label: 'Digs', key: 'digs'),
        (label: 'Blocks', key: 'blocks'),
        (label: 'Sets', key: 'assists'),
        (label: 'Err', key: 'errors'),
        (label: 'Srv Err', key: 'serve_errors'),
        (label: 'Rcv Err', key: 'reception_errors'),
      ];
    case 'table-tennis':
      return const [
        (label: 'PTS', key: 'pts_scored'),
        (label: 'Winners', key: 'winners'),
        (label: 'Aces', key: 'aces'),
        (label: 'Err', key: 'errors'),
      ];
    default:
      return const [];
  }
}

const double _rowHeight = 40;
const double _statColWidth = 52;
const double _teamColWidth = 84;
const double _playerColWidth = 110;

/// Roster (live + completed matches) and full per-player stats (completed
/// only — the server zeroes `stats` itself for anything not completed, see
/// apps/server/src/routes/scoring.ts's /:matchId/roster). Team + player name
/// stay pinned on the left while stat columns scroll horizontally — same
/// frozen-column pattern as the web version, just built without a table
/// element since Flutter has no native sticky-column table widget.
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
        final statDefs = showStats ? _statKeys(sport) : const <({String label, String key})>[];

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
                Text(
                  showStats ? 'Player Stats' : 'Roster',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: LayoutTokens.secondaryText(context)),
                ),
                const SizedBox(height: 10),
                showStats
                    ? _StatsTable(playerStats: playerStats, statDefs: statDefs, nameA: nameA, nameB: nameB)
                    : _RosterList(playerStats: playerStats, nameA: nameA, nameB: nameB),
              ],
            ),
          ),
        );
      },
    );
  }
}

String _playerName(Map<String, dynamic> p) {
  final athlete = p['athlete'] as Map<String, dynamic>?;
  final profile = athlete?['profile'] as Map<String, dynamic>?;
  final name = (profile?['full_name'] as String?)?.trim();
  return (name != null && name.isNotEmpty) ? name : 'Athlete';
}

String _teamLabel(Map<String, dynamic> p, String nameA, String nameB) {
  final direct = (p['team_name'] as String?)?.trim();
  if (direct != null && direct.isNotEmpty) return direct;
  final side = p['participant_side'] as String?;
  return side == 'a' ? nameA : side == 'b' ? nameB : 'Team';
}

/// Live matches (no stats yet) — simple two-column roster, no scrolling needed.
class _RosterList extends StatelessWidget {
  const _RosterList({required this.playerStats, required this.nameA, required this.nameB});

  final List<Map<String, dynamic>> playerStats;
  final String nameA;
  final String nameB;

  @override
  Widget build(BuildContext context) {
    final sideA = playerStats.where((p) => p['participant_side'] == 'a').toList();
    final sideB = playerStats.where((p) => p['participant_side'] == 'b').toList();
    Widget column(String label, List<Map<String, dynamic>> players) {
      return Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: LayoutTokens.mutedText(context)), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            ...players.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(_playerName(p), style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurface)),
                )),
          ],
        ),
      );
    }

    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [column(nameA, sideA), const SizedBox(width: 16), column(nameB, sideB)]);
  }
}

/// Completed matches — full stat table, Team+Player pinned, stats scroll
/// horizontally. One shared horizontal ScrollController would over-engineer
/// this for a single table; instead the pinned and scrollable halves are
/// built as two column-aligned blocks sharing the same per-row height.
class _StatsTable extends StatelessWidget {
  const _StatsTable({required this.playerStats, required this.statDefs, required this.nameA, required this.nameB});

  final List<Map<String, dynamic>> playerStats;
  final List<({String label, String key})> statDefs;
  final String nameA;
  final String nameB;

  @override
  Widget build(BuildContext context) {
    final headerColor = LayoutTokens.mutedText(context);
    final borderColor = LayoutTokens.borderSubtle(context);

    Widget pinnedCell(String text, double width, {bool header = false}) {
      return SizedBox(
        width: width,
        height: _rowHeight,
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: header
                ? TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: headerColor)
                : TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurface),
          ),
        ),
      );
    }

    Widget statCell(String text, {bool header = false}) {
      return SizedBox(
        width: _statColWidth,
        height: _rowHeight,
        child: Center(
          child: Text(
            text,
            style: header
                ? TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: headerColor)
                : TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurface),
          ),
        ),
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Pinned Team + Player columns.
        Column(
          children: [
            Row(children: [pinnedCell('Team', _teamColWidth, header: true), pinnedCell('Player', _playerColWidth, header: true)]),
            Container(height: 1, width: _teamColWidth + _playerColWidth, color: borderColor),
            ...playerStats.map((p) => Row(children: [
                  pinnedCell(_teamLabel(p, nameA, nameB), _teamColWidth),
                  pinnedCell(_playerName(p), _playerColWidth),
                ])),
          ],
        ),
        // Horizontally scrollable stat columns.
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: statDefs.map((s) => statCell(s.label, header: true)).toList()),
                Container(height: 1, width: _statColWidth * statDefs.length, color: borderColor),
                ...playerStats.map((p) {
                  final stats = (p['stats'] as Map?)?.cast<String, dynamic>() ?? const {};
                  return Row(
                    children: statDefs.map((s) => statCell('${(stats[s.key] as num?)?.toInt() ?? 0}')).toList(),
                  );
                }),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
