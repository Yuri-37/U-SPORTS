import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final seasonsListProvider = StreamProvider<List<Map<String, dynamic>>>((ref) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final rows = await Supabase.instance.client
          .from('seasons')
          .select('id, name, status, start_date, end_date, created_at')
          .inFilter('status', ['active', 'completed', 'archived'])
          .order('start_date', ascending: false);
      if (ctrl.isClosed) return;
      ctrl.add((rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-seasons-list')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'seasons',
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

final leaderboardPlayersProvider = StreamProvider.autoDispose
    .family<List<Map<String, dynamic>>, ({String sport, String seasonId})>((ref, args) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final rows = await Supabase.instance.client
          .from('player_season_stats')
          .select(
            '*, athlete:athletes(id, student_id, sport, jersey_number, position, profile:profiles!athletes_profile_id_fkey(full_name, avatar_url))',
          )
          .eq('sport', args.sport)
          .eq('season_id', args.seasonId)
          .order('games_played', ascending: false)
          .limit(100);
      if (ctrl.isClosed) return;
      ctrl.add((rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final sid = args.seasonId;
  final ch = Supabase.instance.client.channel('mobile-lb-players-${args.sport}-$sid')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'player_season_stats',
      callback: (payload) {
        final row = payload.newRecord;
        final old = payload.oldRecord;
        final rSeason = row['season_id'] ?? old['season_id'];
        final rSport = row['sport'] ?? old['sport'];
        if (rSeason == sid && rSport == args.sport) load();
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

final leaderboardTeamsProvider = StreamProvider.autoDispose
    .family<List<Map<String, dynamic>>, ({String sport, String seasonId})>((ref, args) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final rows = await Supabase.instance.client
          .from('team_season_stats')
          .select('*, team:teams(id, name, sport)')
          .eq('season_id', args.seasonId)
          .order('wins', ascending: false);
      if (ctrl.isClosed) return;
      final list = (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      ctrl.add(list.where((r) => (r['team'] as Map?)?['sport'] == args.sport).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final sid = args.seasonId;
  final ch = Supabase.instance.client.channel('mobile-lb-teams-${args.sport}-$sid')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'team_season_stats',
      callback: (payload) {
        final row = payload.newRecord;
        final old = payload.oldRecord;
        final rSeason = row['season_id'] ?? old['season_id'];
        if (rSeason == sid) load();
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

/// Web parity: first active season, else most recent by start_date.
String? defaultSeasonId(List<Map<String, dynamic>> seasons) {
  if (seasons.isEmpty) return null;
  for (final s in seasons) {
    if (s['status'] == 'active') return s['id'] as String;
  }
  return seasons.first['id'] as String;
}

String formatSeasonSelectLabel(Map<String, dynamic> season) {
  final name = season['name'] as String? ?? 'Season';
  final status = season['status'] as String? ?? '';
  if (status == 'active') return '$name · Active';
  if (status == 'completed') return '$name · Completed';
  if (status == 'archived') return '$name · Archived';
  return name;
}
