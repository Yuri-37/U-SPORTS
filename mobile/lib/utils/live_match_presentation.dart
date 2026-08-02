class LiveScoreView {
  LiveScoreView({
    required this.left,
    required this.right,
    required this.phase,
    required this.subtitle,
  });

  final num left;
  final num right;
  final String phase;
  final String subtitle;
}

num _nz(dynamic v) => v is num ? v : (num.tryParse('$v') ?? 0);

int _clampPeriod(int p) => p.clamp(1, 5);

num _basketballTotal(Map<String, dynamic>? sc) {
  if (sc == null) return 0;
  final fromPeriods = _nz(sc['q1']) + _nz(sc['q2']) + _nz(sc['q3']) + _nz(sc['q4']) + _nz(sc['ot']);
  if (fromPeriods > 0) return fromPeriods;
  return _nz(sc['total']);
}

String _sportPhrase(String sport) {
  if (sport == 'basketball') return 'Basketball';
  if (sport == 'volleyball') return 'Volleyball';
  if (sport == 'table-tennis') return 'Table tennis';
  return sport;
}

LiveScoreView liveScorePresentation(
  String sport,
  Map<String, dynamic>? sa,
  Map<String, dynamic>? sb,
  int period,
) {
  final p = _clampPeriod(period);
  if (sport == 'basketball') {
    return LiveScoreView(
      left: _basketballTotal(sa),
      right: _basketballTotal(sb),
      phase: p <= 4 ? 'Quarter $p' : 'Overtime',
      subtitle: '${_sportPhrase(sport)} · Game total',
    );
  }
  if (sport == 'volleyball') {
    const keys = ['set1', 'set2', 'set3', 'set4', 'set5'];
    final k = keys[p - 1];
    return LiveScoreView(
      left: _nz(sa?[k]),
      right: _nz(sb?[k]),
      phase: 'Set $p (rally points)',
      subtitle: '${_nz(sa?['sets_won'])}–${_nz(sb?['sets_won'])} sets won · ${_sportPhrase(sport)}',
    );
  }
  if (sport == 'table-tennis') {
    const keys = ['game1', 'game2', 'game3', 'game4', 'game5'];
    final k = keys[p - 1];
    return LiveScoreView(
      left: _nz(sa?[k]),
      right: _nz(sb?[k]),
      phase: 'Game $p (points)',
      subtitle: '${_nz(sa?['games_won'])}–${_nz(sb?['games_won'])} games won · ${_sportPhrase(sport)}',
    );
  }
  return LiveScoreView(left: 0, right: 0, phase: '', subtitle: sport);
}

({Map<String, dynamic>? sa, Map<String, dynamic>? sb}) pickScoresForMatch(
  String? participantA,
  String? participantB,
  List<dynamic>? scores,
) {
  final rows = scores ?? [];
  Map<String, dynamic>? sa;
  Map<String, dynamic>? sb;
  for (final raw in rows) {
    final r = Map<String, dynamic>.from(raw as Map);
    final pid = r['participant_id'] as String?;
    if (pid == participantA) sa = r;
    if (pid == participantB) sb = r;
  }
  return (sa: sa, sb: sb);
}
