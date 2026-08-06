class EventPlacement {
  EventPlacement({required this.rank, required this.participantId, required this.role});
  final int rank;
  final String participantId;
  final String role;
}

const _poolTypes = {'rr_pool_a', 'rr_pool_b', 'round_robin'};

/// Ports [deriveEliminationPodium] from web `eventPlacements.ts`.
List<EventPlacement>? deriveEliminationPodium(List<Map<String, dynamic>> brackets) {
  final structural = brackets.where((b) {
    final t = b['bracket_type'] as String? ?? 'winners';
    if (t == 'losers') return false;
    if (_poolTypes.contains(t)) return false;
    return true;
  }).toList();
  if (structural.isEmpty) return null;

  final maxRound = structural.map((b) => (b['round'] as num?)?.toInt() ?? 0).reduce((a, c) => a > c ? a : c);
  final finals = structural.where((b) {
    if ((b['round'] as num?)?.toInt() != maxRound) return false;
    if (b['is_bye'] == true) return false;
    return b['winner_id'] != null && b['participant_a_id'] != null && b['participant_b_id'] != null;
  }).toList();
  if (finals.isEmpty) return null;

  Map<String, dynamic>? grand;
  for (final f in finals) {
    if (f['bracket_type'] == 'grand_final') {
      grand = f;
      break;
    }
  }
  final Map<String, dynamic> finalBracket;
  if (grand != null) {
    finalBracket = grand;
  } else {
    finals.sort((a, b) => ((a['match_order'] as num?) ?? 0).compareTo((b['match_order'] as num?) ?? 0));
    finalBracket = finals.first;
  }

  final w = finalBracket['winner_id'] as String;
  final a = finalBracket['participant_a_id'] as String;
  final b = finalBracket['participant_b_id'] as String;
  final runner = w == a ? b : a;

  return [
    EventPlacement(rank: 1, participantId: w, role: 'champion'),
    EventPlacement(rank: 2, participantId: runner, role: 'runner_up'),
  ];
}

String placementRankLabel(int rank) {
  if (rank == 1) return 'Champion';
  if (rank == 2) return 'Runner-up';
  return '#$rank';
}

/// Full event standings — every participant that appears anywhere in the
/// bracket, not just champion/runner-up. Ports deriveFullEventStandings from
/// web `eventPlacements.ts` — see that file for the full design rationale
/// (elimination: rank by furthest round reached, ties share a rank;
/// round robin: rank by event-scoped win/loss record).
List<EventPlacement>? deriveFullEventStandings(List<Map<String, dynamic>> brackets) {
  if (brackets.isEmpty) return null;
  final hasPool = brackets.any((b) => _poolTypes.contains(b['bracket_type'] as String? ?? ''));
  return hasPool ? _deriveRoundRobinStandings(brackets) : _deriveEliminationStandings(brackets);
}

List<EventPlacement>? _deriveEliminationStandings(List<Map<String, dynamic>> brackets) {
  final podium = deriveEliminationPodium(brackets);
  if (podium == null) return null;
  final champion = podium[0];
  final runnerUp = podium[1];

  final remaining = <String>{};
  for (final b in brackets) {
    final a = b['participant_a_id'] as String?;
    final bb = b['participant_b_id'] as String?;
    if (a != null) remaining.add(a);
    if (bb != null) remaining.add(bb);
  }
  remaining.remove(champion.participantId);
  remaining.remove(runnerUp.participantId);

  final effectiveRound = <String, int>{};
  for (final b in brackets) {
    final round = (b['round'] as num?)?.toInt() ?? 0;
    final r = (b['bracket_type'] as String?) == 'losers' ? round - 1000000 : round;
    for (final pid in [b['participant_a_id'] as String?, b['participant_b_id'] as String?]) {
      if (pid == null || !remaining.contains(pid)) continue;
      final cur = effectiveRound[pid];
      if (cur == null || r > cur) effectiveRound[pid] = r;
    }
  }

  final grouped = <int, List<String>>{};
  effectiveRound.forEach((pid, r) {
    grouped.putIfAbsent(r, () => []).add(pid);
  });
  final roundsDesc = grouped.keys.toList()..sort((a, b) => b.compareTo(a));

  final placements = <EventPlacement>[
    EventPlacement(rank: 1, participantId: champion.participantId, role: 'champion'),
    EventPlacement(rank: 2, participantId: runnerUp.participantId, role: 'runner_up'),
  ];
  var rank = 3;
  for (final r in roundsDesc) {
    final ids = [...grouped[r]!]..sort();
    for (final pid in ids) {
      placements.add(EventPlacement(rank: rank, participantId: pid, role: 'ranked'));
    }
    rank += ids.length;
  }
  return placements;
}

List<EventPlacement>? _deriveRoundRobinStandings(List<Map<String, dynamic>> brackets) {
  final poolBrackets = brackets.where((b) => _poolTypes.contains(b['bracket_type'] as String? ?? '')).toList();
  if (poolBrackets.isEmpty) return null;

  final wins = <String, int>{};
  final losses = <String, int>{};
  void touch(String id) {
    wins.putIfAbsent(id, () => 0);
    losses.putIfAbsent(id, () => 0);
  }

  for (final b in poolBrackets) {
    final a = b['participant_a_id'] as String?;
    final bb = b['participant_b_id'] as String?;
    if (a != null) touch(a);
    if (bb != null) touch(bb);
    final winnerId = b['winner_id'] as String?;
    if (winnerId == null || a == null || bb == null) continue;
    final loserId = winnerId == a ? bb : a;
    wins[winnerId] = (wins[winnerId] ?? 0) + 1;
    losses[loserId] = (losses[loserId] ?? 0) + 1;
  }

  Map<String, dynamic>? finalBracket;
  for (final b in brackets) {
    if (b['bracket_type'] == 'knockout_final' && b['winner_id'] != null && b['participant_a_id'] != null && b['participant_b_id'] != null) {
      finalBracket = b;
      break;
    }
  }
  final championId = finalBracket?['winner_id'] as String?;
  final runnerUpId = finalBracket == null
      ? null
      : (finalBracket['participant_a_id'] == championId ? finalBracket['participant_b_id'] as String? : finalBracket['participant_a_id'] as String?);

  final rest = wins.keys.where((id) => id != championId && id != runnerUpId).toList();
  rest.sort((a, b) {
    final wa = wins[a] ?? 0, wb = wins[b] ?? 0;
    if (wb != wa) return wb.compareTo(wa);
    final la = losses[a] ?? 0, lb = losses[b] ?? 0;
    if (la != lb) return la.compareTo(lb);
    return a.compareTo(b);
  });

  final placements = <EventPlacement>[];
  var rank = 1;
  if (championId != null) {
    placements.add(EventPlacement(rank: 1, participantId: championId, role: 'champion'));
    rank = 2;
  }
  if (runnerUpId != null) {
    placements.add(EventPlacement(rank: rank, participantId: runnerUpId, role: 'runner_up'));
    rank++;
  }

  var i = 0;
  while (i < rest.length) {
    final wa = wins[rest[i]] ?? 0;
    final la = losses[rest[i]] ?? 0;
    var j = i;
    while (j < rest.length && (wins[rest[j]] ?? 0) == wa && (losses[rest[j]] ?? 0) == la) {
      j++;
    }
    final groupSize = j - i;
    for (var k = i; k < j; k++) {
      var role = 'ranked';
      if (championId == null && rank == 1 && groupSize == 1) role = 'champion';
      if (runnerUpId == null && rank == 2 && groupSize == 1) role = 'runner_up';
      placements.add(EventPlacement(rank: rank, participantId: rest[k], role: role));
    }
    rank += groupSize;
    i = j;
  }
  return placements;
}
