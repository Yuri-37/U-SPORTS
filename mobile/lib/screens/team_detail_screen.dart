import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';
import '../utils/participant_labels.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';

class _RosterEntry {
  _RosterEntry({required this.athleteId, required this.name, required this.position, required this.jerseyNumber});
  final String athleteId;
  final String name;
  final String? position;
  final String? jerseyNumber;
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
        name: (prof?['full_name'] as String?) ?? 'Athlete',
        position: (ath['position'] as String?)?.trim(),
        jerseyNumber: ath['jersey_number']?.toString(),
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
      .select('id, scheduled_at, status, participant_a_id, participant_b_id, scores:match_scores(*), event:events(name, sport)')
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

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/leaderboards');
            }
          },
        ),
        title: const Text('Team'),
      ),
      body: teamAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(friendlyError(e))),
        data: (team) {
          if (team == null) {
            return const Center(child: Text('Team not found.'));
          }
          final stats = statsAsync.valueOrNull;
          final w = (stats?['wins'] as num?)?.toInt() ?? 0;
          final l = (stats?['losses'] as num?)?.toInt() ?? 0;
          final total = w + l;
          final pct = total > 0 ? ((w / total) * 100).round() : 0;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: AppTheme.schoolPrimary,
                    child: Text(sportEmoji(team.sport), style: const TextStyle(fontSize: 26)),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(team.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        Text(sportLabel(team.sport), style: TextStyle(color: LayoutTokens.secondaryText(context))),
                      ],
                    ),
                  ),
                ],
              ),
              if (stats != null) ...[
                const SizedBox(height: 24),
                const Text('Season record', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _RecordChip(label: 'W', value: '$w', color: LayoutTokens.success(context)),
                    const SizedBox(width: 10),
                    _RecordChip(label: 'L', value: '$l', color: AppTheme.danger),
                    const SizedBox(width: 10),
                    _RecordChip(label: 'WIN%', value: '$pct%', color: LayoutTokens.mutedText(context)),
                  ],
                ),
              ],
              const SizedBox(height: 24),
              Text('Roster (${team.roster.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 10),
              if (team.roster.isEmpty)
                Text('No roster yet.', style: TextStyle(color: LayoutTokens.mutedText(context)))
              else
                ...team.roster.map(
                  (p) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Material(
                      color: LayoutTokens.cardBackground(context),
                      borderRadius: BorderRadius.circular(12),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => context.push('/athletes/${p.athleteId}'),
                        child: ListTile(
                          title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: (p.position != null && p.position!.isNotEmpty) ? Text(p.position!) : null,
                          trailing: (p.jerseyNumber != null && p.jerseyNumber!.isNotEmpty)
                              ? Text('#${p.jerseyNumber}', style: TextStyle(fontWeight: FontWeight.w700, color: LayoutTokens.mutedText(context)))
                              : null,
                        ),
                      ),
                    ),
                  ),
                ),
              if (team.coaches.isNotEmpty) ...[
                const SizedBox(height: 24),
                const Text('Coaches', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: team.coaches.map((c) => Chip(label: Text(c))).toList()),
              ],
              const SizedBox(height: 24),
              const Text('Matches', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 10),
              matchesAsync.when(
                loading: () => const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
                error: (e, _) => Text(friendlyError(e)),
                data: (matches) {
                  if (matches.isEmpty) {
                    return Text('No matches yet.', style: TextStyle(color: LayoutTokens.mutedText(context)));
                  }
                  return Column(
                    children: matches.map((m) {
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
                      final scoreLine = (status == 'completed' || status == 'live') && myScore != null && oppScore != null
                          ? '${myScore['total'] ?? 0} - ${oppScore['total'] ?? 0}'
                          : null;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Material(
                          color: LayoutTokens.cardBackground(context),
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('vs $opponent', style: const TextStyle(fontWeight: FontWeight.w700)),
                                      const SizedBox(height: 2),
                                      Text(eventName, style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context))),
                                      if (m['scheduled_at'] != null)
                                        Text(
                                          formatDateTime(m['scheduled_at'] as String?),
                                          style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(context)),
                                        ),
                                    ],
                                  ),
                                ),
                                if (scoreLine != null)
                                  Text(scoreLine, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))
                                else
                                  Text(matchStatusLabel(status), style: TextStyle(color: LayoutTokens.mutedText(context))),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RecordChip extends StatelessWidget {
  const _RecordChip({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: LayoutTokens.cardBackground(context), borderRadius: BorderRadius.circular(12)),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(context))),
          ],
        ),
      ),
    );
  }
}
