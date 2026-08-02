import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../utils/participant_labels.dart';

typedef LiveHubMatch = Map<String, dynamic>;

/// Live matches + labels: Supabase Realtime + short polling while games are live (covers flaky WebSockets).
final hubLiveProvider = StreamProvider<HubLiveSnapshot>((ref) {
  final ctrl = StreamController<HubLiveSnapshot>();
  var reloadSeq = 0;
  Timer? livePoll;
  var disposed = false;

  Future<void> reload() async {
    if (disposed) return;
    final seq = ++reloadSeq;
    try {
      final rows = await Supabase.instance.client
          .from('matches')
          .select('*, scores:match_scores(*), event:events(name, sport)')
          .eq('status', 'live')
          .limit(10);
      if (disposed || seq != reloadSeq) return;
      final list = (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      if (seq != reloadSeq) return;
      final partIds = <String>{};
      for (final m in list) {
        final a = m['participant_a_id'] as String?;
        final b = m['participant_b_id'] as String?;
        if (a != null) partIds.add(a);
        if (b != null) partIds.add(b);
      }
      final labels = partIds.isEmpty ? <String, String>{} : await fetchParticipantLabels(partIds.toList());
      if (disposed || seq != reloadSeq) return;
      final mids = list.map((m) => m['id'] as String).toList();
      final periodByMatch = <String, int>{};
      if (mids.isNotEmpty) {
        final actions = await Supabase.instance.client
            .from('scoring_actions')
            .select('match_id, quarter_or_set, timestamp')
            .inFilter('match_id', mids)
            .eq('undone', false)
            .order('timestamp', ascending: false);
        if (disposed || seq != reloadSeq) return;
        final seen = <String>{};
        for (final raw in actions as List) {
          final row = Map<String, dynamic>.from(raw as Map);
          final mid = row['match_id'] as String?;
          if (mid == null || seen.contains(mid)) continue;
          seen.add(mid);
          final q = row['quarter_or_set'];
          periodByMatch[mid] = q is num ? q.toInt() : 1;
        }
        for (final mid in mids) {
          periodByMatch.putIfAbsent(mid, () => 1);
        }
      }
      if (disposed || seq != reloadSeq) return;
      if (list.isNotEmpty) {
        livePoll?.cancel();
        if (!disposed) {
          livePoll = Timer.periodic(const Duration(seconds: 2), (_) {
            if (!disposed) reload();
          });
        }
      } else {
        livePoll?.cancel();
        livePoll = null;
      }
      if (disposed || ctrl.isClosed) return;
      ctrl.add(HubLiveSnapshot(matches: list, participantLabels: labels, periodByMatch: periodByMatch));
    } catch (e, st) {
      if (!disposed && !ctrl.isClosed && seq == reloadSeq) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-hub-live')
    ..onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'matches', callback: (_) => reload())
    ..onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'match_scores', callback: (_) => reload())
    ..onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'scoring_actions', callback: (_) => reload())
    ..subscribe();

  reload();
  ref.onDispose(() async {
    disposed = true;
    livePoll?.cancel();
    livePoll = null;
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});

class HubLiveSnapshot {
  HubLiveSnapshot({
    required this.matches,
    required this.participantLabels,
    required this.periodByMatch,
  });

  final List<LiveHubMatch> matches;
  final Map<String, String> participantLabels;
  final Map<String, int> periodByMatch;
}
