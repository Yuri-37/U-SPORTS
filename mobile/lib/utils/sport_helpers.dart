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

String sportEmoji(String sport) {
  switch (sport) {
    case 'basketball':
      return '🏀';
    case 'volleyball':
      return '🏐';
    case 'table-tennis':
      return '🏓';
    default:
      return '🏅';
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
        (label: 'Kills', value: '${n('kills').toInt()}'),
        (label: 'Aces', value: '${n('aces').toInt()}'),
        (label: 'Digs', value: '${n('digs').toInt()}'),
        (label: 'Blocks', value: '${n('blocks').toInt()}'),
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
