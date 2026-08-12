/// Sport-specific stat columns for leaderboard tables (web GuestLeaderboards parity).
///
/// Every key read here is one that recompute_player_season_stats actually
/// aggregates from player_game_stats. Table tennis previously showed a "Win%"
/// column reading `win_pct`, and profiles showed "Match wins" reading `mw` --
/// neither is ever written by scoring (only the retired showcase seed script
/// produced them), so both rendered 0 for every player forever.
library;

class LeaderboardStatCell {
  const LeaderboardStatCell({required this.label, required this.value, this.emphasis = false});
  final String label;
  final String value;
  final bool emphasis;
}

/// Reads a numeric stat key, tolerating string-encoded numbers from JSONB.
num statNum(Map<String, dynamic>? stats, String key) {
  final v = (stats ?? const {})[key];
  if (v is num) return v;
  return num.tryParse('$v') ?? 0;
}

/// Whole-percent string, e.g. 47%. Returns '—' when the denominator is 0 so an
/// unplayed stat line doesn't read as a real 0% performance.
String pct(num made, num attempted) {
  if (attempted <= 0) return '—';
  return '${((made / attempted) * 100).round()}%';
}

/// Winners-to-errors ratio. With no errors the ratio is undefined rather than
/// zero, so fall back to the winner count itself (which is how it reads in
/// practice: "9 winners, no errors").
String ratio(num numerator, num denominator) {
  if (denominator <= 0) return numerator > 0 ? numerator.toStringAsFixed(1) : '—';
  return (numerator / denominator).toStringAsFixed(1);
}

List<LeaderboardStatCell> playerStatCells(String sport, Map<String, dynamic>? stats, int gamesPlayed) {
  final gp = gamesPlayed;
  num n(String k) => statNum(stats, k);

  if (sport == 'basketball') {
    String avg(num total) => gp > 0 ? (total / gp).toStringAsFixed(1) : '0.0';
    return [
      LeaderboardStatCell(label: 'GP', value: '$gp'),
      LeaderboardStatCell(label: 'PPG', value: avg(n('total_points')), emphasis: true),
      LeaderboardStatCell(label: 'RPG', value: avg(n('total_rebounds'))),
      LeaderboardStatCell(label: 'APG', value: avg(n('total_assists'))),
      LeaderboardStatCell(label: 'SPG', value: avg(n('total_steals'))),
      LeaderboardStatCell(label: 'BPG', value: avg(n('total_blocks'))),
      LeaderboardStatCell(label: 'FG%', value: pct(n('fg_made'), n('fg_attempted'))),
    ];
  }
  if (sport == 'volleyball') {
    return [
      LeaderboardStatCell(label: 'GP', value: '$gp'),
      LeaderboardStatCell(label: 'PTS', value: '${n('pts_scored').toInt()}', emphasis: true),
      LeaderboardStatCell(label: 'Kills', value: '${n('kills').toInt()}'),
      LeaderboardStatCell(label: 'Aces', value: '${n('aces').toInt()}'),
      LeaderboardStatCell(label: 'Digs', value: '${n('digs').toInt()}'),
      LeaderboardStatCell(label: 'Blocks', value: '${n('blocks').toInt()}'),
      LeaderboardStatCell(label: 'Kill%', value: pct(n('kills'), n('attacks'))),
    ];
  }
  if (sport == 'table-tennis') {
    return [
      LeaderboardStatCell(label: 'GP', value: '$gp'),
      LeaderboardStatCell(label: 'PTS', value: '${n('pts_scored').toInt()}', emphasis: true),
      LeaderboardStatCell(label: 'Winners', value: '${n('winners').toInt()}'),
      LeaderboardStatCell(label: 'Aces', value: '${n('aces').toInt()}'),
      LeaderboardStatCell(label: 'Errors', value: '${n('errors').toInt()}'),
      LeaderboardStatCell(label: 'W/E', value: ratio(n('winners'), n('errors'))),
    ];
  }
  return [LeaderboardStatCell(label: 'GP', value: '$gp')];
}
