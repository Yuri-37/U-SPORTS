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

/// The stat a leaderboard ranks on -- the same one `playerStatCells` marks with
/// `emphasis`. Averages are per-game so a substitute with one huge night can't
/// outrank a season-long starter on raw totals; counting stats stay totals.
num rankingValue(String sport, Map<String, dynamic>? stats, int gamesPlayed) {
  if (sport == 'basketball') {
    return gamesPlayed > 0 ? statNum(stats, 'total_points') / gamesPlayed : 0;
  }
  if (sport == 'volleyball' || sport == 'table-tennis') {
    return statNum(stats, 'pts_scored');
  }
  return gamesPlayed;
}

/// Sorts leaderboard rows best-first, in place on a copy.
///
/// The Supabase query can only order by a real column (games_played), which
/// leaves everyone on equal GP in arbitrary database order -- so the "#" column
/// read as a rank while showing none. Ties break on games played, then name, so
/// the order is stable across reloads.
List<Map<String, dynamic>> sortByRank(List<Map<String, dynamic>> rows, String sport) {
  String nameOf(Map<String, dynamic> r) {
    final athlete = r['athlete'] as Map<String, dynamic>?;
    final prof = athlete?['profile'] as Map<String, dynamic>?;
    return (prof?['full_name'] as String?) ?? '';
  }

  int gpOf(Map<String, dynamic> r) => (r['games_played'] as num?)?.toInt() ?? 0;
  Map<String, dynamic>? statsOf(Map<String, dynamic> r) => r['stats'] as Map<String, dynamic>?;

  final out = [...rows];
  out.sort((a, b) {
    final diff = rankingValue(sport, statsOf(b), gpOf(b)) - rankingValue(sport, statsOf(a), gpOf(a));
    if (diff != 0) return diff > 0 ? 1 : -1;
    if (gpOf(b) != gpOf(a)) return gpOf(b) - gpOf(a);
    return nameOf(a).compareTo(nameOf(b));
  });
  return out;
}

/// Sorts team standings best-first: win percentage, then wins, then fewer
/// losses, then name.
///
/// The queries order by `wins` alone, which ties 2W-0L with 2W-3L and can leave
/// the better team below the worse one. Win percentage first is the standard
/// standings rule and handles teams that have played unequal numbers of games.
List<Map<String, dynamic>> sortTeamStandings(List<Map<String, dynamic>> rows) {
  int winsOf(Map<String, dynamic> r) => (r['wins'] as num?)?.toInt() ?? 0;
  int lossesOf(Map<String, dynamic> r) => (r['losses'] as num?)?.toInt() ?? 0;
  String nameOf(Map<String, dynamic> r) {
    final team = r['team'] as Map<String, dynamic>?;
    return (team?['name'] as String?) ?? '';
  }

  double pctOf(Map<String, dynamic> r) {
    final played = winsOf(r) + lossesOf(r);
    return played > 0 ? winsOf(r) / played : 0;
  }

  final out = [...rows];
  out.sort((a, b) {
    final pctDiff = pctOf(b) - pctOf(a);
    if (pctDiff != 0) return pctDiff > 0 ? 1 : -1;
    if (winsOf(b) != winsOf(a)) return winsOf(b) - winsOf(a);
    if (lossesOf(a) != lossesOf(b)) return lossesOf(a) - lossesOf(b);
    return nameOf(a).compareTo(nameOf(b));
  });
  return out;
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
