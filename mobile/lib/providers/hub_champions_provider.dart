import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../utils/event_placements.dart';
import '../utils/participant_labels.dart';

class ChampionSpotlight {
  ChampionSpotlight({
    required this.eventId,
    required this.eventName,
    required this.sport,
    required this.placements,
    required this.labels,
  });
  final String eventId;
  final String eventName;
  final String sport;
  final List<EventPlacement> placements;
  final Map<String, String> labels;
}

Future<List<ChampionSpotlight>> _loadChampions() async {
  final completed = await Supabase.instance.client
      .from('events')
      .select('id,name,sport')
      .eq('status', 'completed')
      .order('created_at', ascending: false)
      .limit(8);
  final rows = <ChampionSpotlight>[];
  final partIds = <String>{};

  for (final ev in completed as List) {
    final m = Map<String, dynamic>.from(ev as Map);
    final id = m['id'] as String;
    final br = await Supabase.instance.client
        .from('brackets')
        .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
        .eq('event_id', id);
    final podium = deriveEliminationPodium((br as List).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    if (podium == null) continue;
    for (final p in podium) {
      partIds.add(p.participantId);
    }
    rows.add(ChampionSpotlight(
      eventId: id,
      eventName: m['name'] as String? ?? 'Event',
      sport: m['sport'] as String? ?? '',
      placements: podium,
      labels: {},
    ));
  }

  final labels = partIds.isEmpty ? <String, String>{} : await fetchParticipantLabels(partIds.toList());
  return rows.map((r) {
    final lb = <String, String>{};
    for (final p in r.placements) {
      final l = labels[p.participantId];
      if (l != null) lb[p.participantId] = l;
    }
    return ChampionSpotlight(
      eventId: r.eventId,
      eventName: r.eventName,
      sport: r.sport,
      placements: r.placements,
      labels: {...labels, ...lb},
    );
  }).toList();
}

/// Recent champions strip — live refresh when events or brackets change.
final hubChampionsProvider = StreamProvider<List<ChampionSpotlight>>((ref) {
  final ctrl = StreamController<List<ChampionSpotlight>>();

  Future<void> load() async {
    try {
      final list = await _loadChampions();
      if (ctrl.isClosed) return;
      ctrl.add(list);
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-hub-champions')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'events',
      callback: (_) => load(),
    )
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'brackets',
      callback: (_) => load(),
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});
