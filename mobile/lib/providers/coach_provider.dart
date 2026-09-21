import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../utils/participant_labels.dart';

/// One team the signed-in coach is assigned to, as returned by
/// GET /teams/my-teams (which resolves team_coaches -> organizers for the
/// caller, so the server — not the client — decides what a coach may see).
class CoachTeam {
  CoachTeam({
    required this.id,
    required this.name,
    required this.sport,
    required this.department,
    required this.seasonId,
    required this.members,
  });

  factory CoachTeam.fromJson(Map<String, dynamic> j) {
    final rawMembers = (j['members'] as List<dynamic>? ?? const []);
    final members = rawMembers
        .map((m) => CoachRosterMember.fromJson(Map<String, dynamic>.from(m as Map)))
        .where((m) => m.athleteId.isNotEmpty)
        .toList()
      ..sort(CoachRosterMember.byLineupThenName);
    return CoachTeam(
      id: j['id'] as String,
      name: j['name'] as String? ?? 'Team',
      sport: j['sport'] as String? ?? '',
      department: j['department'] as String?,
      seasonId: j['season_id'] as String?,
      members: members,
    );
  }

  final String id;
  final String name;
  final String sport;
  final String? department;
  final String? seasonId;
  final List<CoachRosterMember> members;

  int get startingCount => members.where((m) => m.lineupSlot != null).length;
}

/// A roster row. `membershipId` is the team_members row (what the lineup
/// endpoint keys on); `athleteId` is the athlete (what roster-details keys on).
class CoachRosterMember {
  CoachRosterMember({
    required this.membershipId,
    required this.athleteId,
    required this.name,
    required this.jerseyNumber,
    required this.position,
    required this.lineupSlot,
  });

  factory CoachRosterMember.fromJson(Map<String, dynamic> j) {
    final athlete = j['athlete'] as Map<String, dynamic>?;
    final profile = athlete?['profile'] as Map<String, dynamic>?;
    return CoachRosterMember(
      membershipId: j['id'] as String? ?? '',
      athleteId: athlete?['id'] as String? ?? '',
      name: (profile?['full_name'] as String?)?.trim().isNotEmpty == true
          ? (profile!['full_name'] as String).trim()
          : 'Athlete',
      jerseyNumber: athlete?['jersey_number']?.toString(),
      position: (athlete?['position'] as String?)?.trim(),
      lineupSlot: (j['lineup_slot'] as num?)?.toInt(),
    );
  }

  final String membershipId;
  final String athleteId;
  final String name;
  final String? jerseyNumber;
  final String? position;

  /// Non-null means starting lineup; null means bench.
  final int? lineupSlot;

  bool get isStarting => lineupSlot != null;

  /// Starters first (by slot), then bench alphabetically — the same order the
  /// web roster uses, so a coach reads the same list on either screen.
  static int byLineupThenName(CoachRosterMember a, CoachRosterMember b) {
    if (a.isStarting != b.isStarting) return a.isStarting ? -1 : 1;
    if (a.isStarting && b.isStarting) return a.lineupSlot!.compareTo(b.lineupSlot!);
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  }
}

/// The coach's own teams. Kept alive (not autoDispose) so switching tabs does
/// not refetch; call `ref.invalidate(coachTeamsProvider)` after an edit.
final coachTeamsProvider = FutureProvider<List<CoachTeam>>((ref) async {
  final api = ref.read(apiClientProvider);
  final data = await api.getJson('/teams/my-teams');
  if (data is! List) return const [];
  return data
      .map((t) => CoachTeam.fromJson(Map<String, dynamic>.from(t as Map)))
      .toList()
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
});

/// Whether the signed-in user coaches this team — what the team page checks
/// before it offers any edit control.
///
/// The role is tested first so a guest or an athlete opening a team page never
/// triggers the my-teams fetch (which would 401 for them anyway). This only
/// decides whether to *show* a control; every write is re-authorised by the
/// server.
final canManageTeamProvider = Provider.family<bool, String>((ref, teamId) {
  final role = ref.watch(profileProvider).valueOrNull?.role;
  if (role != 'Coach') return false;
  final teams = ref.watch(coachTeamsProvider).valueOrNull;
  return teams?.any((t) => t.id == teamId) ?? false;
});

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

/// Matches for every team the coach is assigned to, newest first.
///
/// The ids go into a PostgREST `or()` filter, which is a string — so each one
/// is checked against the UUID shape first. They come from our own API today,
/// but a filter built by concatenation is exactly where a stray value would
/// change the query's meaning rather than being rejected by it.
final coachMatchesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final teams = await ref.watch(coachTeamsProvider.future);
  final ids = teams.map((t) => t.id).where(_uuidPattern.hasMatch).toList();
  if (ids.isEmpty) return const [];

  final joined = ids.join(',');
  final rows = await Supabase.instance.client
      .from('matches')
      .select(
        'id, event_id, scheduled_at, status, participant_a_id, participant_b_id, '
        'scores:match_scores(*), event:events(name, sport)',
      )
      .or('participant_a_id.in.($joined),participant_b_id.in.($joined)')
      .order('scheduled_at', ascending: false)
      .limit(40);

  final list = (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  // Resolve the other side's display name once for the whole list.
  final mine = ids.toSet();
  final opponentIds = <String>{};
  for (final m in list) {
    final a = m['participant_a_id'] as String?;
    final b = m['participant_b_id'] as String?;
    final opponent = mine.contains(a) ? b : a;
    if (opponent != null) opponentIds.add(opponent);
  }
  final labels =
      opponentIds.isEmpty ? <String, String>{} : await fetchParticipantLabels(opponentIds.toList());

  for (final m in list) {
    final a = m['participant_a_id'] as String?;
    final b = m['participant_b_id'] as String?;
    final myId = mine.contains(a) ? a : b;
    final opponent = mine.contains(a) ? b : a;
    m['myParticipantId'] = myId;
    m['opponentName'] = opponent == null ? 'TBD' : (labels[opponent] ?? 'TBD');
  }
  return list;
});
