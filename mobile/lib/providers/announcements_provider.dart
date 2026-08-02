import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Public announcements for banner + hero ticker (matches web `AnnouncementBanner` public modes).
final announcementsHubProvider = StreamProvider<List<Map<String, dynamic>>>((ref) {
  final controller = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    final now = DateTime.now().toUtc().toIso8601String();
    final rows = await Supabase.instance.client
        .from('announcements')
        .select()
        .inFilter('display_mode', ['banner', 'hero_slider'])
        .eq('is_public', true)
        .or('expires_at.is.null,expires_at.gt.$now')
        .order('published_at', ascending: false);
    controller.add((rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList());
  }

  final channel = Supabase.instance.client.channel('announcements-mobile-hub')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'announcements',
      callback: (_) => load(),
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    await channel.unsubscribe();
    await controller.close();
  });

  return controller.stream;
});
