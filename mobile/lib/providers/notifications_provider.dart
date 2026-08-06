import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_provider.dart';

/// Exact unread row count from the database (not limited to the inbox list page size).
final unreadNotificationsCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final profile = await ref.watch(profileProvider.future);
  if (profile == null) return 0;
  final count = await Supabase.instance.client
      .from('notifications')
      .count(CountOption.exact)
      .eq('recipient_id', profile.id)
      .eq('hidden', false)
      .eq('read', false);
  return count;
});

final notificationsListProvider = StreamProvider<List<Map<String, dynamic>>>((ref) async* {
  final profile = await ref.watch(profileProvider.future);
  if (profile == null) {
    yield [];
    return;
  }

  Future<List<Map<String, dynamic>>> load() async {
    final rows = await Supabase.instance.client
        .from('notifications')
        .select()
        .eq('recipient_id', profile.id)
        .eq('hidden', false)
        .order('created_at', ascending: false)
        .limit(50);
    return (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  yield await load();
  ref.invalidate(unreadNotificationsCountProvider);

  final controller = StreamController<List<Map<String, dynamic>>>();
  final channel = Supabase.instance.client.channel('notifications-${profile.id}')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'notifications',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'recipient_id',
        value: profile.id,
      ),
      callback: (_) {
        load().then((batch) {
          controller.add(batch);
          ref.invalidate(unreadNotificationsCountProvider);
        });
      },
    )
    ..subscribe();

  ref.onDispose(() async {
    await channel.unsubscribe();
    await controller.close();
  });

  await for (final batch in controller.stream) {
    yield batch;
  }
});

Future<void> markNotificationRead(String id) async {
  await Supabase.instance.client.from('notifications').update({'read': true}).eq('id', id);
}

Future<void> markAllNotificationsRead(String recipientId) async {
  await Supabase.instance.client.from('notifications').update({'read': true}).eq('recipient_id', recipientId).eq('read', false);
}

// Soft-hide, not a real delete — the row (and the user's notification
// history) survives; it just drops out of [notificationsListProvider]'s results.
Future<void> deleteNotification(String id) async {
  await Supabase.instance.client.from('notifications').update({'hidden': true}).eq('id', id);
}

Future<void> clearAllNotifications(String recipientId) async {
  await Supabase.instance.client.from('notifications').update({'hidden': true}).eq('recipient_id', recipientId);
}

/// Bell badge: exact unread count from [unreadNotificationsCountProvider] for athletes.
final athleteNotificationBadgeCountProvider = Provider<int>((ref) {
  final profile = ref.watch(profileProvider).valueOrNull;
  if (profile == null || !profile.isAthlete) return 0;
  final unreadAsync = ref.watch(unreadNotificationsCountProvider);
  return unreadAsync.valueOrNull ?? 0;
});
