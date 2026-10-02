import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/utils/event_placements.dart';
import 'package:u_sports_mobile/utils/format_helpers.dart';
import 'package:u_sports_mobile/utils/leaderboard_stats.dart';
import 'package:u_sports_mobile/utils/live_match_presentation.dart';
import 'package:u_sports_mobile/utils/participant_labels.dart';

Map<String, dynamic> _bracket(int round, int order, String a, String b, String? winner, {String? type}) => {
      'round': round,
      'match_order': order,
      'participant_a_id': a,
      'participant_b_id': b,
      'winner_id': winner,
      'is_bye': false,
      'bracket_type': type,
    };

Map<String, dynamic> _team(String name, int wins, int losses) => {
      'wins': wins,
      'losses': losses,
      'team': {'name': name},
    };

void main() {
  group('live score presentation', () {
    test('totals basketball quarters and names the quarter', () {
      final p = liveScorePresentation('basketball', {'q1': 10, 'q2': 12}, {'q1': 8, 'q2': 9}, 2);
      expect(p.left, 22);
      expect(p.right, 17);
      expect(p.phase, 'Quarter 2');
      expect(p.subtitle, 'Basketball · Game total');
    });

    test('shows the current volleyball set and sets won', () {
      final p = liveScorePresentation(
        'volleyball',
        {'set1': 25, 'set2': 10, 'sets_won': 1},
        {'set1': 20, 'set2': 12, 'sets_won': 0},
        2,
      );
      expect([p.left, p.right], [10, 12]);
      expect(p.phase, 'Set 2 (rally points)');
      expect(p.subtitle, contains('1–0 sets won'));
    });

    test('shows the current table tennis game and games won', () {
      final p = liveScorePresentation('table-tennis', {'game1': 11, 'games_won': 1}, {'game1': 7, 'games_won': 0}, 1);
      expect([p.left, p.right], [11, 7]);
      expect(p.subtitle, contains('1–0 games won'));
    });

    test('matches score rows to the right side', () {
      final picked = pickScoresForMatch('A', 'B', [
        {'participant_id': 'B', 'q1': 9},
        {'participant_id': 'A', 'q1': 4},
      ]);
      expect(picked.sa?['q1'], 4);
      expect(picked.sb?['q1'], 9);
    });
  });

  group('team rankings', () {
    test('rank by win percentage, not raw wins', () {
      final sorted = sortTeamStandings([_team('Steady', 3, 3), _team('Perfect', 2, 0)]);
      expect(sorted.map((t) => (t['team'] as Map)['name']), ['Perfect', 'Steady']);
    });

    test('break ties on wins, fewer losses, then name', () {
      final sorted = sortTeamStandings([
        _team('Zulu', 2, 2),
        _team('Alpha', 2, 2),
        _team('Fewer losses', 1, 1),
      ]);
      expect(sorted.map((t) => (t['team'] as Map)['name']), ['Alpha', 'Zulu', 'Fewer losses']);
    });
  });

  group('event placements', () {
    test('rank a knockout and share third place', () {
      final standings = deriveFullEventStandings([
        _bracket(1, 1, 'A', 'B', 'A'),
        _bracket(1, 2, 'C', 'D', 'D'),
        _bracket(2, 1, 'A', 'D', 'D'),
      ])!;
      expect(standings.map((s) => '${s.participantId}:${s.rank}'), ['D:1', 'A:2', 'B:3', 'C:3']);
    });

    test('no standings until the final is decided', () {
      expect(deriveFullEventStandings([_bracket(1, 1, 'A', 'B', null)]), isNull);
    });
  });

  group('labels', () {
    test('uses the name, a short id, or TBD', () {
      expect(participantDisplayLabel({'x': 'Warriors'}, 'x'), 'Warriors');
      expect(participantDisplayLabel({}, '1234567890abcdef'), 'Team 12345678…');
      expect(participantDisplayLabel({}, null), 'TBD');
    });

    test('formats enum and status text for people', () {
      expect(formatEnumLabel('table_tennis'), 'Table Tennis');
      expect(eventPublicLifecycleLabel('registration'), 'Upcoming');
      expect(eventPublicLifecycleLabel('in_progress'), 'Ongoing');
      expect(matchStatusLabel('live'), 'Live now');
      expect(formatDateTime(null), '—');
    });
  });
}
