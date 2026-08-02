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

final profileProvider = FutureProvider<ProfileRow?>((ref) async {
  ref.watch(authRefreshNotifierProvider);
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return null;
  final row = await Supabase.instance.client
      .from('profiles')
      .select()
      .eq('id', user.id)
      .maybeSingle();
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
        .maybeSingle();
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
