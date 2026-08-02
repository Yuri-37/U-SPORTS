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
List<({String label, String value})> seasonStatHighlights(String sport, Map<String, dynamic>? stats, int gamesPlayed) {
  final s = stats ?? {};
  final gp = gamesPlayed <= 0 ? 1 : gamesPlayed;
  switch (sport) {
    case 'basketball':
      final pts = (s['total_points'] as num?)?.toDouble() ?? 0;
      final reb = (s['total_rebounds'] as num?)?.toDouble() ?? 0;
      final ast = (s['total_assists'] as num?)?.toDouble() ?? 0;
      return [
        (label: 'PPG', value: (pts / gp).toStringAsFixed(1)),
        (label: 'RPG', value: (reb / gp).toStringAsFixed(1)),
        (label: 'APG', value: (ast / gp).toStringAsFixed(1)),
      ];
    case 'volleyball':
      return [
        (label: 'Kills', value: '${s['kills'] ?? 0}'),
        (label: 'Aces', value: '${s['aces'] ?? 0}'),
        (label: 'Digs', value: '${s['digs'] ?? 0}'),
      ];
    case 'table-tennis':
      return [
        (label: 'Match wins', value: '${s['mw'] ?? 0}'),
        (label: 'Win %', value: '${s['win_pct'] ?? 0}%'),
      ];
    default:
      return [(label: 'Games', value: '$gamesPlayed')];
  }
}
