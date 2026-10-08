import 'package:flutter/material.dart';

import 'leaderboard_stats.dart' show statNum, pct, ratio;

String sportLabel(String sport) {
  switch (sport) {
    case 'basketball':
      return 'Basketball';
    case 'volleyball':
      return 'Volleyball';
    case 'table-tennis':
      return 'Table tennis';
    default:
      return sport.replaceAll('-', ' ').split(' ').map((w) {
        if (w.isEmpty) return w;
        return '${w[0].toUpperCase()}${w.substring(1)}';
      }).join(' ');
  }
}

/// The sport glyph, as a drawn icon rather than an emoji -- emoji rendered as
/// whatever colour font the device shipped and sat oddly beside the Material
/// icons used everywhere else in the app.
IconData sportIcon(String sport) {
  switch (sport) {
    case 'basketball':
      return Icons.sports_basketball_outlined;
    case 'volleyball':
      return Icons.sports_volleyball_outlined;
    case 'table-tennis':
      return Icons.sports_tennis_outlined;
    default:
      return Icons.emoji_events_outlined;
  }
}

/// Stat summary lines for leaderboard / profile (sport-specific).
///
/// Keys must be ones recompute_player_season_stats actually aggregates. Table
/// tennis used to show 'Match wins' (`mw`) and 'Win %' (`win_pct`), neither of
/// which scoring ever writes -- they read 0 for every player, forever.
List<({String label, String value})> seasonStatHighlights(String sport, Map<String, dynamic>? stats, int gamesPlayed) {
  num n(String k) => statNum(stats, k);
  final gp = gamesPlayed <= 0 ? 1 : gamesPlayed;
  switch (sport) {
    case 'basketball':
      return [
        (label: 'PPG', value: (n('total_points') / gp).toStringAsFixed(1)),
        (label: 'RPG', value: (n('total_rebounds') / gp).toStringAsFixed(1)),
        (label: 'APG', value: (n('total_assists') / gp).toStringAsFixed(1)),
        (label: 'FG%', value: pct(n('fg_made'), n('fg_attempted'))),
      ];
    case 'volleyball':
      return [
        (label: 'Attack', value: '${n('attacks').toInt()}'),
        (label: 'Aces', value: '${n('aces').toInt()}'),
        (label: 'Exc Dig', value: '${n('digs').toInt()}'),
        (label: 'Exc Set', value: '${n('assists').toInt()}'),
      ];
    case 'table-tennis':
      return [
        (label: 'PTS', value: '${n('pts_scored').toInt()}'),
        (label: 'Winners', value: '${n('winners').toInt()}'),
        (label: 'Aces', value: '${n('aces').toInt()}'),
        (label: 'W/E', value: ratio(n('winners'), n('errors'))),
      ];
    default:
      return [(label: 'Games', value: '$gamesPlayed')];
  }
}
