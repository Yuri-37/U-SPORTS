import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/profile_row.dart';
import 'auth_listen.dart';

final authRefreshNotifierProvider = Provider<AuthRefreshNotifier>((ref) {
  final n = AuthRefreshNotifier();
  ref.onDispose(n.dispose);
  return n;
});

final authUserProvider = Provider<User?>((ref) {
  ref.watch(authRefreshNotifierProvider);
  return Supabase.instance.client.auth.currentUser;
});

/// Un-timed-out Supabase calls here used to be able to hang indefinitely
/// offline (TCP retransmits far outlast the OS-level connectivity-drop
/// signal), which stalled the router's `redirect` forever — see
/// router.dart's redirect and main.dart's reconnect listener, which together
/// close the loop this timeout opens: fail fast here, fail open there, retry
/// on reconnect in main.dart.
const _authFetchTimeout = Duration(seconds: 8);

final profileProvider = FutureProvider<ProfileRow?>((ref) async {
  ref.watch(authRefreshNotifierProvider);
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return null;
  final row = await Supabase.instance.client
      .from('profiles')
      .select()
      .eq('id', user.id)
      .maybeSingle()
      .timeout(_authFetchTimeout);
  if (row == null) return null;
  final map = Map<String, dynamic>.from(row as Map);

  // Post-migration 037: profiles.role is staff-only (Admin/Organizer/Coach) and is
  // NULL for athletes. Athlete identity is represented by a row in `athletes`.
  // Synthesize role='athlete' so the rest of the app's role checks keep working.
  final staffRole = (map['role'] as String?)?.trim();
  if (staffRole == null || staffRole.isEmpty) {
    final athlete = await Supabase.instance.client
        .from('athletes')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle()
        .timeout(_authFetchTimeout);
    map['role'] = athlete != null ? 'athlete' : 'guest';
  }
  return ProfileRow.fromJson(map);
});

final athleteRowProvider = FutureProvider<AthleteRow?>((ref) async {
  final profile = await ref.watch(profileProvider.future);
  if (profile == null || !profile.isAthlete) return null;
  final row = await Supabase.instance.client
      .from('athletes')
      .select()
      .eq('profile_id', profile.id)
      .maybeSingle();
  if (row == null) return null;
  return AthleteRow.fromJson(Map<String, dynamic>.from(row as Map));
});
