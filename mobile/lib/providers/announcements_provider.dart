import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Public announcements for banner + hero ticker (matches web `AnnouncementBanner` public modes).
final announcementsHubProvider = StreamProvider<List<Map<String, dynamic>>>((ref) {
  final controller = StreamController<List<Map<String, dynamic>>>();
  Timer? nextReload;

  Future<void> load() async {
    nextReload?.cancel();
    final now = DateTime.now().toUtc();
    try {
      final rows = await Supabase.instance.client
          .from('announcements')
          .select()
          .inFilter('display_mode', ['banner', 'hero_slider'])
          .eq('is_public', true)
          // An announcement for one sport, event or team is for those people,
          // not for the public ticker (older rows may still be marked public).
          .eq('audience_type', 'all')
          .or('expires_at.is.null,expires_at.gt.${now.toIso8601String()}')
          .order('published_at', ascending: false);
      // The provider can be disposed while this request is in flight.
      if (controller.isClosed) return;
      final list = (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      controller.add(list);

      // An announcement can expire while the app sits open. Nothing in the
      // table changes when that happens, so no realtime event fires and the
      // banner would stay until some unrelated update. Reload at the soonest
      // upcoming expiry instead.
      DateTime? soonest;
      for (final a in list) {
        final raw = a['expires_at'] as String?;
        final at = raw == null ? null : DateTime.tryParse(raw);
        if (at != null && at.isAfter(now) && (soonest == null || at.isBefore(soonest))) {
          soonest = at;
        }
      }
      if (soonest != null) {
        var wait = soonest.difference(DateTime.now().toUtc()) + const Duration(milliseconds: 250);
        // Re-check at least hourly, which also covers a device clock that was
        // changed while the app was open.
        if (wait > const Duration(hours: 1)) wait = const Duration(hours: 1);
        nextReload = Timer(wait, load);
      }
    } catch (_) {
      // Offline or a cold server: keep showing what we already have rather
      // than replacing a good banner with an error, and try again shortly.
      if (!controller.isClosed) nextReload = Timer(const Duration(seconds: 60), load);
    }
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
    nextReload?.cancel();
    await channel.unsubscribe();
    await controller.close();
  });

  return controller.stream;
});
