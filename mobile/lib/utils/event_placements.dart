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

String placementRankLabel(int rank) => rank == 1 ? 'Champion' : 'Runner-up';
