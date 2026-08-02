import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/api_service.dart';

String? _eventIdFromPayload(PostgresChangePayload payload) {
  final n = payload.newRecord;
  final o = payload.oldRecord;
  final v = n['event_id'] ?? o['event_id'];
  return v as String?;
}

String? _matchIdFromPayload(PostgresChangePayload payload) {
  final n = payload.newRecord;
  final o = payload.oldRecord;
  final v = n['match_id'] ?? o['match_id'];
  if (v != null) return v as String?;
  final rowId = n['id'] ?? o['id'];
  return rowId?.toString();
}

final eventListProvider = StreamProvider.family<List<Map<String, dynamic>>, Map<String, String?>>((ref, filters) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final api = ref.read(apiClientProvider);
      final q = <String, String>{};
      if (filters['seasonId'] != null) q['seasonId'] = filters['seasonId']!;
      if (filters['sport'] != null) q['sport'] = filters['sport']!;
      if (filters['status'] != null) q['status'] = filters['status']!;
      // isTryout filter removed as per Phase 1 (tryout system removed)
      final data = await api.getJson('/events', query: q.isEmpty ? null : q);
      if (ctrl.isClosed) return;
      if (data is! List) {
        ctrl.add([]);
        return;
      }
      ctrl.add(data.map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final key = Object.hash(
    filters['seasonId'],
    filters['sport'],
    filters['status'],
  );
  final ch = Supabase.instance.client.channel('mobile-api-events-$key')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'events',
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

final eventDetailProvider = StreamProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, eventId) {
  final ctrl = StreamController<Map<String, dynamic>?>();

  Future<void> load() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/events/$eventId');
      if (ctrl.isClosed) return;
      if (data is Map) {
        ctrl.add(Map<String, dynamic>.from(data));
      } else {
        ctrl.add(null);
      }
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  void onEventRow(PostgresChangePayload payload) {
    final id = payload.newRecord['id'] ?? payload.oldRecord['id'];
    if (id != null && id.toString() == eventId) load();
  }

  final ch = Supabase.instance.client.channel('mobile-api-event-detail-$eventId')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'events',
      callback: onEventRow,
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});

final bracketsForEventProvider = StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, eventId) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/brackets/$eventId');
      if (ctrl.isClosed) return;
      if (data is! List) {
        ctrl.add([]);
        return;
      }
      ctrl.add(data.map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-api-brackets-$eventId')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'brackets',
      callback: (p) {
        if (_eventIdFromPayload(p) == eventId) load();
      },
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});

final matchesForEventProvider = StreamProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, eventId) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();
  var loadSeq = 0;
  var matchIdsForEvent = <String>{};
  Timer? livePoll;
  var disposed = false;

  bool scoreChangeTargetsThisEvent(PostgresChangePayload p) {
    final mid = _matchIdFromPayload(p);
    if (mid == null) return false;
    return matchIdsForEvent.contains(mid);
  }

  Future<void> load() async {
    if (disposed) return;
    final seq = ++loadSeq;
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/events/$eventId/matches');
      if (disposed || ctrl.isClosed) return;
      if (seq != loadSeq) return;
      if (data is! List) {
        matchIdsForEvent = {};
        livePoll?.cancel();
        livePoll = null;
        if (!ctrl.isClosed) ctrl.add([]);
        return;
      }
      final mapped = data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      matchIdsForEvent = mapped.map((m) => m['id'] as String?).whereType<String>().toSet();
      final hasLive = mapped.any((m) => m['status'] == 'live');
      if (hasLive) {
        livePoll?.cancel();
        if (!disposed) {
          livePoll = Timer.periodic(const Duration(seconds: 2), (_) {
            if (!disposed) load();
          });
        }
      } else {
        livePoll?.cancel();
        livePoll = null;
      }
      if (disposed || ctrl.isClosed) return;
      ctrl.add(mapped);
    } catch (e, st) {
      if (!disposed && !ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-api-matches-$eventId')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'matches',
      callback: (p) {
        if (_eventIdFromPayload(p) == eventId) load();
      },
    )
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'match_scores',
      callback: (p) {
        if (scoreChangeTargetsThisEvent(p)) load();
      },
    )
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'scoring_actions',
      callback: (p) {
        if (scoreChangeTargetsThisEvent(p)) load();
      },
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    disposed = true;
    livePoll?.cancel();
    livePoll = null;
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});

final scoringStateProvider = StreamProvider.autoDispose.family<Map<String, dynamic>, String>((ref, matchId) {
  final ctrl = StreamController<Map<String, dynamic>>();
  var loadSeq = 0;
  var disposed = false;

  Future<void> load() async {
    if (disposed) return;
    final seq = ++loadSeq;
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/scoring/$matchId/state');
      if (disposed || ctrl.isClosed) return;
      if (seq != loadSeq) return;
      if (data is Map) {
        ctrl.add(Map<String, dynamic>.from(data));
      } else {
        ctrl.add({});
      }
    } catch (e, st) {
      if (!disposed && !ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  void onMatchRow(PostgresChangePayload p) {
    final id = p.newRecord['id'] ?? p.oldRecord['id'];
    if (id != null && id.toString() == matchId) load();
  }

  final ch = Supabase.instance.client.channel('mobile-api-scoring-$matchId')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'match_scores',
      callback: (p) {
        if (_matchIdFromPayload(p) == matchId) load();
      },
    )
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'scoring_actions',
      callback: (p) {
        if (_matchIdFromPayload(p) == matchId) load();
      },
    )
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'matches',
      callback: onMatchRow,
    )
    ..subscribe();

  final poll = Timer.periodic(const Duration(milliseconds: 2500), (_) {
    if (!disposed) load();
  });

  load();
  ref.onDispose(() async {
    disposed = true;
    poll.cancel();
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});
