/// Sport-specific stat columns for leaderboard tables (web GuestLeaderboards parity).
library;

class LeaderboardStatCell {
  const LeaderboardStatCell({required this.label, required this.value, this.emphasis = false});
  final String label;
  final String value;
  final bool emphasis;
}

List<LeaderboardStatCell> playerStatCells(String sport, Map<String, dynamic>? stats, int gamesPlayed) {
  final gp = gamesPlayed;
  final s = stats ?? {};
  num n(dynamic k) => s[k] is num ? s[k] as num : (num.tryParse('${s[k]}') ?? 0);

  if (sport == 'basketball') {
    String avg(num total) => gp > 0 ? (total / gp).toStringAsFixed(1) : '0.0';
    return [
      LeaderboardStatCell(label: 'GP', value: '$gp'),
      LeaderboardStatCell(label: 'PPG', value: avg(n('total_points')), emphasis: true),
      LeaderboardStatCell(label: 'RPG', value: avg(n('total_rebounds'))),
      LeaderboardStatCell(label: 'APG', value: avg(n('total_assists'))),
    ];
  }
  if (sport == 'volleyball') {
    return [
      LeaderboardStatCell(label: 'GP', value: '$gp'),
      LeaderboardStatCell(label: 'Kills', value: '${n('kills').toInt()}', emphasis: true),
      LeaderboardStatCell(label: 'Aces', value: '${n('aces').toInt()}'),
    ];
  }
  if (sport == 'table-tennis') {
    return [
      LeaderboardStatCell(label: 'GP', value: '$gp'),
      LeaderboardStatCell(label: 'Win%', value: '${s['win_pct'] ?? '0'}%', emphasis: true),
    ];
  }
  return [LeaderboardStatCell(label: 'GP', value: '$gp')];
}
