import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/coach_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';
import '../utils/live_match_presentation.dart';
import '../utils/participant_labels.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';
import '../widgets/coach_roster_edit_sheet.dart';
import '../widgets/ui/brand_page.dart';

/// Opens the courtside roster sheet for one player. Only reachable when
/// [canManageTeamProvider] says this user coaches the team; the API re-checks
/// that on every write.
Future<void> _openRosterEdit(
  BuildContext context,
  WidgetRef ref,
  String teamId,
  String sport,
  _RosterEntry player,
) async {
  final result = await showModalBottomSheet<RosterEditResult>(
    context: context,
    isScrollControlled: true,
    builder: (_) => CoachRosterEditSheet(
      teamId: teamId,
      sport: sport,
      athleteId: player.athleteId,
      membershipId: player.membershipId,
      name: player.name,
      jerseyNumber: player.jerseyNumber,
      position: player.position,
      isStarting: player.lineupSlot != null,
    ),
  );
  if (result?.changed ?? false) {
    ref.invalidate(_teamDetailProvider(teamId));
    // The coach home shows jersey/starting counts off the same data.
    ref.invalidate(coachTeamsProvider);
  }
}

class _RosterEntry {
  _RosterEntry({
    required this.athleteId,
    required this.membershipId,
    required this.name,
    required this.position,
    required this.jerseyNumber,
    this.lineupSlot,
  });
  final String athleteId;

  /// The team_members row — what the lineup endpoint keys on, as opposed to
  /// the athlete itself.
  final String membershipId;
  final String name;
  final String? position;
  final String? jerseyNumber;

  /// Non-null for the starting lineup; null for bench. Drives the "Starting"
  /// badge, matching the web team page.
  final int? lineupSlot;
}

class _TeamDetailData {
  _TeamDetailData({required this.name, required this.sport, required this.roster, required this.coaches});
  final String name;
  final String sport;
  final List<_RosterEntry> roster;
  final List<String> coaches;
}

final _teamDetailProvider = FutureProvider.autoDispose.family<_TeamDetailData?, String>((ref, teamId) async {
  final rows = await Supabase.instance.client
      .from('team_members')
      .select('''
        id,
        lineup_slot,
        athlete:athletes(id, position, jersey_number, profile:profiles!athletes_profile_id_fkey(full_name)),
        team:teams(
          id, name, sport,
          coaches:team_coaches(organizer:organizers(profile:profiles!organizers_profile_id_fkey(full_name)))
        )
      ''')
      .eq('team_id', teamId);

  final list = (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  String? name;
  String? sport;
  final roster = <_RosterEntry>[];
  final coaches = <String>{};

  for (final row in list) {
    final team = row['team'] as Map<String, dynamic>?;
    name ??= team?['name'] as String?;
    sport ??= team?['sport'] as String?;
    if (coaches.isEmpty) {
      final coachRows = team?['coaches'] as List<dynamic>? ?? [];
      for (final c in coachRows) {
        final org = (c as Map)['organizer'] as Map<String, dynamic>?;
        final prof = org?['profile'] as Map<String, dynamic>?;
        final cname = (prof?['full_name'] as String?)?.trim();
        if (cname != null && cname.isNotEmpty) coaches.add(cname);
      }
    }
    final ath = row['athlete'] as Map<String, dynamic>?;
    if (ath != null && ath['id'] != null) {
      final prof = ath['profile'] as Map<String, dynamic>?;
      roster.add(_RosterEntry(
        athleteId: ath['id'] as String,
        membershipId: row['id'] as String? ?? '',
        name: (prof?['full_name'] as String?) ?? 'Athlete',
        position: (ath['position'] as String?)?.trim(),
        jerseyNumber: ath['jersey_number']?.toString(),
        lineupSlot: (row['lineup_slot'] as num?)?.toInt(),
      ));
    }
  }

  // Roster-less team (no members yet) — fetch the row directly so the header still renders.
  if (name == null) {
    final t = await Supabase.instance.client.from('teams').select('name, sport').eq('id', teamId).maybeSingle();
    if (t == null) return null;
    name = t['name'] as String? ?? 'Team';
    sport = t['sport'] as String? ?? '';
  }

  return _TeamDetailData(name: name, sport: sport ?? '', roster: roster, coaches: coaches.toList());
});

final _teamStatsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, teamId) async {
  final s = await Supabase.instance.client
      .from('team_season_stats')
      .select()
      .eq('team_id', teamId)
      .order('updated_at', ascending: false)
      .limit(1)
      .maybeSingle();
  return s == null ? null : Map<String, dynamic>.from(s as Map);
});

final _teamMatchesProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, teamId) async {
  final rows = await Supabase.instance.client
      .from('matches')
      .select('id, event_id, scheduled_at, status, participant_a_id, participant_b_id, scores:match_scores(*), event:events(name, sport)')
      .or('participant_a_id.eq.$teamId,participant_b_id.eq.$teamId')
      .order('scheduled_at', ascending: false)
      .limit(20);
  final list = (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  final opponentIds = <String>{};
  for (final m in list) {
    final a = m['participant_a_id'] as String?;
    final b = m['participant_b_id'] as String?;
    final opponent = a == teamId ? b : a;
    if (opponent != null && opponent.isNotEmpty) opponentIds.add(opponent);
  }
  final labels = opponentIds.isEmpty ? <String, String>{} : await fetchParticipantLabels(opponentIds.toList());

  for (final m in list) {
    final a = m['participant_a_id'] as String?;
    final b = m['participant_b_id'] as String?;
    final opponentId = a == teamId ? b : a;
    m['opponentName'] = participantDisplayLabel(labels, opponentId);
  }
  return list;
});

class TeamDetailScreen extends ConsumerWidget {
  const TeamDetailScreen({super.key, required this.teamId});

  final String teamId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teamAsync = ref.watch(_teamDetailProvider(teamId));
    final statsAsync = ref.watch(_teamStatsProvider(teamId));
    final matchesAsync = ref.watch(_teamMatchesProvider(teamId));
    // Coaches of this team get the roster edit affordance; everyone else sees
    // the same page they always have.
    final canEditRoster = ref.watch(canManageTeamProvider(teamId));

    return teamAsync.when(
      loading: () => const BrandPage.fixed(title: 'Team', body: Center(child: CircularProgressIndicator())),
      error: (e, _) => BrandPage.fixed(title: 'Team', body: SheetMessage(text: friendlyError(e))),
      data: (team) {
        if (team == null) {
          return const BrandPage.fixed(title: 'Team', body: SheetMessage(text: 'Team not found.'));
        }
        final stats = statsAsync.valueOrNull;
        final w = (stats?['wins'] as num?)?.toInt() ?? 0;
        final l = (stats?['losses'] as num?)?.toInt() ?? 0;
        final total = w + l;
        final pct = total > 0 ? ((w / total) * 100).round() : 0;

        return BrandPage.scroll(
          title: team.name,
          subtitle: sportLabel(team.sport),
          hero: stats != null
              ? FrostedCard(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                  child: FrostedStats(
                    stats: [
                      (label: 'Wins', value: '$w'),
                      (label: 'Losses', value: '$l'),
                      (label: 'Win %', value: '$pct%'),
                    ],
                  ),
                )
              : null,
          children: [
            SectionHeader(title: 'Roster (${team.roster.length})'),
            if (team.roster.isEmpty)
              const SheetMessage(text: 'No roster yet.')
            else
              SheetGroup(
                children: [
                  for (final p in team.roster) _rosterRow(context, ref, team, p, canEditRoster),
                ],
              ),
            if (team.coaches.isNotEmpty) ...[
              const SectionHeader(title: 'Coaches'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: team.coaches
                    .map((c) => Chip(label: Text(c, style: const TextStyle(fontWeight: FontWeight.w600))))
                    .toList(),
              ),
            ],
            const SectionHeader(title: 'Matches'),
            matchesAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => SheetMessage(text: friendlyError(e)),
              data: (matches) {
                if (matches.isEmpty) return const SheetMessage(text: 'No matches yet.');
                return SheetGroup(
                  children: [for (final m in matches) _matchRow(context, m, team.sport)],
                );
              },
            ),
          ],
        );
      },
    );
  }

  Widget _rosterRow(
    BuildContext context,
    WidgetRef ref,
    _TeamDetailData team,
    _RosterEntry p,
    bool canEditRoster,
  ) {
    return SheetTile(
      leading: const IconTile(icon: Icons.person_rounded),
      title: p.name,
      subtitle: p.position,
      onTap: () => context.push('/athletes/${p.athleteId}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (p.lineupSlot != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: LayoutTokens.success(context).withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'Starting',
                style: GoogleFonts.plusJakartaSans(
                  color: LayoutTokens.success(context),
                  fontWeight: FontWeight.w800,
                  fontSize: 10.5,
                ),
              ),
            ),
          if (p.jerseyNumber != null && p.jerseyNumber!.isNotEmpty) ...[
            const SizedBox(width: 8),
            Text('#${p.jerseyNumber}',
                style: TextStyle(fontWeight: FontWeight.w700, color: LayoutTokens.mutedText(context))),
          ],
          if (canEditRoster) ...[
            const SizedBox(width: 2),
            IconButton(
              tooltip: 'Edit jersey, position and lineup',
              icon: const Icon(Icons.edit_outlined, size: 18),
              onPressed: () => _openRosterEdit(context, ref, teamId, team.sport, p),
            ),
          ],
        ],
      ),
    );
  }

  Widget _matchRow(BuildContext context, Map<String, dynamic> m, String sport) {
    final status = m['status'] as String? ?? 'scheduled';
    final ev = m['event'] as Map<String, dynamic>?;
    final eventName = ev?['name'] as String? ?? 'Match';
    final opponent = m['opponentName'] as String? ?? 'TBD';
    final scores = (m['scores'] as List?)?.map((s) => Map<String, dynamic>.from(s as Map)).toList() ?? [];
    Map<String, dynamic>? myScore;
    Map<String, dynamic>? oppScore;
    for (final s in scores) {
      if (s['participant_id'] == teamId) {
        myScore = s;
      } else {
        oppScore = s;
      }
    }
    // `total` only adds up the basketball period columns, so reading it
    // directly showed every volleyball and table tennis result as 0 - 0.
    final scoreLine = (status == 'completed' || status == 'live') && myScore != null && oppScore != null
        ? '${matchResultScore(sport, myScore)} - ${matchResultScore(sport, oppScore)}'
        : null;
    final eventId = m['event_id'] as String?;
    final subtitleParts = [
      eventName,
      if (m['scheduled_at'] != null) formatDateTime(m['scheduled_at'] as String?),
    ];

    return SheetTile(
      leading: IconTile(emoji: sportEmoji(sport), color: sportTint(context, sport), size: 40),
      title: 'vs $opponent',
      subtitle: subtitleParts.join(' · '),
      onTap: eventId != null ? () => context.push('/events/$eventId') : null,
      trailing: scoreLine != null
          ? Text(scoreLine, style: AppTheme.display(size: 17, color: LayoutTokens.primaryText(context), height: 1))
          : Text(matchStatusLabel(status), style: TextStyle(color: LayoutTokens.mutedText(context), fontWeight: FontWeight.w600)),
    );
  }
}
