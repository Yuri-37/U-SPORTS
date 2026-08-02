import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Home hub event cards — refetch when `events` rows change (web hub parity).
final hubRecentEventsProvider = StreamProvider<List<Map<String, dynamic>>>((ref) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final rows = await Supabase.instance.client
          .from('events')
          .select('*')
          .inFilter('status', ['registration', 'in_progress'])
          .order('created_at', ascending: false)
          .limit(6);
      if (ctrl.isClosed) return;
      ctrl.add((rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-hub-recent-events')
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
