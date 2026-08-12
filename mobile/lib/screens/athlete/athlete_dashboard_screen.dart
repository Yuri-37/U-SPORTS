import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/auth_provider.dart';
import '../../providers/notifications_provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import '../../utils/event_placements.dart';
import '../../utils/format_helpers.dart';
import '../../utils/participant_labels.dart';
import '../../utils/sport_helpers.dart';
import '../../widgets/double_back_exit.dart';
import '../../widgets/notification_bell_icon_button.dart';
import '../../widgets/stat_chip.dart';
import '../../utils/error_helpers.dart';

class AthleteDashboardScreen extends ConsumerWidget {
  const AthleteDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteAsync = ref.watch(athleteRowProvider);

    return DoubleBackToExit(
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          NotificationBellIconButton(
            badgeCount: ref.watch(athleteNotificationBadgeCountProvider),
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/athlete/settings'),
          ),
        ],
      ),
      body: athleteAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(friendlyError(e))),
        data: (athlete) {
          if (athlete == null) {
            return const Center(child: Text('Athlete profile not found.'));
          }
          return _AthleteDashboardBody(athleteId: athlete.id, sport: athlete.sport);
        },
      ),
    ),
    );
  }
}

class _AthleteDashboardBody extends ConsumerStatefulWidget {
  const _AthleteDashboardBody({required this.athleteId, required this.sport});

  final String athleteId;
  final String sport;

  @override
  ConsumerState<_AthleteDashboardBody> createState() => _AthleteDashboardBodyState();
}

class _AthleteDashboardBodyState extends ConsumerState<_AthleteDashboardBody> {
  List<Map<String, dynamic>> _stats = [];
  List<Map<String, dynamic>> _matches = [];
  List<Map<String, dynamic>> _pastMatches = [];
  List<_TeamGroup> _teams = []; // grouped roster with coaches
  Map<String, int> _finishes = {}; // eventId -> placement rank (1 champion, 2 runner-up)
  Map<String, String> _labels = {};
  Set<String> _teamIds = {};
  bool _loading = true;
  bool _hasLoadedOnce = false;
  String? _error;
  RealtimeChannel? _liveRefreshChannel;
  Timer? _livePoll;

  void _syncLiveSchedulePolling() {
    _livePoll?.cancel();
    _livePoll = null;
    final hasLive = _matches.any((m) => m['status'] == 'live');
    if (!hasLive) return;
    _livePoll = Timer.periodic(const Duration(seconds: 2), (_) => _load());
  }

  @override
  void initState() {
    super.initState();
    _load();
    _liveRefreshChannel = Supabase.instance.client.channel('athlete-dash-${widget.athleteId}')
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'match_scores',
        callback: (_) => _load(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'matches',
        callback: (_) => _load(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'scoring_actions',
        callback: (_) => _load(),
      )
      ..subscribe();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowPasswordNudge());
  }

  /// Nudges athletes still on their account-creation password to change it.
  /// `password_changed_at` is null until they've ever used self-service
  /// change-password (see POST /api/auth/change-password), so this is exactly
  /// the "still on the default/import password" signal — not literally
  /// "first login," but the closest reliable proxy without new schema.
  /// initState only runs once per app session for this tab (the bottom-nav
  /// shell keeps it alive across tab switches), so this naturally shows once
  /// per session rather than on every rebuild.
  Future<void> _maybeShowPasswordNudge() async {
    if (!mounted) return;
    final profile = await ref.read(profileProvider.future);
    if (!mounted || profile == null) return;
    if (profile.passwordChangedAt != null) return;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: LayoutTokens.cardBackground(ctx),
        title: const Text('Update your password'),
        content: const Text(
          "You're still using the password set for you when your account was created. "
          'For security, we recommend changing it.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Later')),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.push('/athlete/settings');
            },
            child: const Text('Change password'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _livePoll?.cancel();
    _liveRefreshChannel?.unsubscribe();
    super.dispose();
  }

  Future<void> _load() async {
    // Only the very first load should blank the screen for a spinner. This is
    // also called every 2s by the live-match poll and on every realtime
    // match_scores/matches/scoring_actions event — resetting _loading on
    // those background refreshes made the whole dashboard flash to a spinner
    // and back repeatedly during a live game instead of updating in place.
    if (!_hasLoadedOnce) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      _error = null;
    }
    try {
      final stats = await Supabase.instance.client
          .from('player_season_stats')
          .select('*, season:seasons(id, name, status)')
          .eq('athlete_id', widget.athleteId)
          .order('updated_at', ascending: false);
      final tm = await Supabase.instance.client.from('team_members').select('team_id').eq('athlete_id', widget.athleteId);
      final teamIds = (tm as List).map((e) => (e as Map)['team_id'] as String?).whereType<String>().toList();

      List<Map<String, dynamic>> upcoming = [];
      List<Map<String, dynamic>> past = [];
      List<Map<String, dynamic>> members = [];
      final finishes = <String, int>{};
      final labels = <String, String>{};

      if (teamIds.isNotEmpty) {
        final raw = await Supabase.instance.client
            .from('matches')
            .select('id, event_id, scheduled_at, venue, status, participant_a_id, participant_b_id, event:events(name, sport)')
            .inFilter('status', ['scheduled', 'live', 'completed'])
            .limit(200);
        final all = (raw as List).map((e) => Map<String, dynamic>.from(e as Map)).where((m) {
          final a = m['participant_a_id'] as String?;
          final b = m['participant_b_id'] as String?;
          return (a != null && teamIds.contains(a)) || (b != null && teamIds.contains(b));
        }).toList();

        final mine = all.where((m) => m['status'] != 'completed').toList();
        mine.sort((a, b) {
          final la = a['status'] == 'live';
          final lb = b['status'] == 'live';
          if (la && !lb) return -1;
          if (!la && lb) return 1;
          final ta = DateTime.tryParse(a['scheduled_at'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
          final tb = DateTime.tryParse(b['scheduled_at'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
          return ta.compareTo(tb);
        });
        upcoming = mine.take(6).toList();

        // Match history: completed games, most recent first
        past = all.where((m) => m['status'] == 'completed').toList()
          ..sort((a, b) {
            final ta = DateTime.tryParse(a['scheduled_at'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
            final tb = DateTime.tryParse(b['scheduled_at'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
            return tb.compareTo(ta);
          });
        past = past.take(12).toList();

        // Resolve opponent labels for both upcoming + past
        final partIds = <String>{};
        for (final m in [...upcoming, ...past]) {
          final a = m['participant_a_id'] as String?;
          final b = m['participant_b_id'] as String?;
          if (a != null && a.isNotEmpty) partIds.add(a);
          if (b != null && b.isNotEmpty) partIds.add(b);
        }
        if (partIds.isNotEmpty) {
          labels.addAll(await fetchParticipantLabels(partIds.toList()));
        }

        // Placements (Champion / Runner-up) for completed events the athlete's teams joined
        final completedEventIds = past
            .map((m) => m['event_id'] as String?)
            .whereType<String>()
            .toSet()
            .toList();
        for (final evId in completedEventIds) {
          final br = await Supabase.instance.client
              .from('brackets')
              .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
              .eq('event_id', evId);
          final podium = deriveEliminationPodium(
            (br as List).map((e) => Map<String, dynamic>.from(e as Map)).toList(),
          );
          if (podium == null) continue;
          for (final p in podium) {
            if (teamIds.contains(p.participantId)) {
              finishes[evId] = p.rank;
              break;
            }
          }
        }

        final mem = await Supabase.instance.client
            .from('team_members')
            .select(
              '''
            team_id,
            lineup_slot,
            athlete:athletes(id, position, jersey_number, profile:profiles!athletes_profile_id_fkey(full_name)),
            team:teams(
              id, name, sport,
              coaches:team_coaches(
                organizer:organizers(profile:profiles!organizers_profile_id_fkey(full_name, email))
              )
            )
          ''',
            )
            .inFilter('team_id', teamIds);
        members = (mem as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }

      // Group roster rows by team, attaching coaches (web parity).
      final teamGroups = <String, _TeamGroup>{};
      for (final row in members) {
        final team = row['team'] as Map<String, dynamic>?;
        final tid = row['team_id'] as String?;
        if (tid == null) continue;
        final group = teamGroups.putIfAbsent(
          tid,
          () => _TeamGroup(
            teamId: tid,
            teamName: team?['name'] as String? ?? 'Team',
            sport: team?['sport'] as String? ?? widget.sport,
          ),
        );
        if (group.coaches.isEmpty) {
          final coachRows = team?['coaches'] as List<dynamic>? ?? [];
          for (final cr in coachRows) {
            final org = (cr as Map)['organizer'] as Map<String, dynamic>?;
            final prof = org?['profile'] as Map<String, dynamic>?;
            final cname = (prof?['full_name'] as String?)?.trim();
            if (cname != null && cname.isNotEmpty) {
              group.coaches.add(_CoachContact(name: cname, email: (prof?['email'] as String?)?.trim()));
            }
          }
        }
        final ath = row['athlete'] as Map<String, dynamic>?;
        if (ath != null && ath['id'] != null) {
          group.members.add({
            'id': ath['id'],
            'position': ath['position'],
            'jersey_number': ath['jersey_number'],
            'lineup_slot': row['lineup_slot'],
            'full_name': (ath['profile'] as Map<String, dynamic>?)?['full_name'],
          });
        }
      }

      if (!mounted) return;
      setState(() {
        _stats = (stats as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _matches = upcoming;
        _pastMatches = past;
        _finishes = finishes;
        _labels = labels;
        _teamIds = teamIds.toSet();
        _teams = teamGroups.values.toList();
        _loading = false;
        _hasLoadedOnce = true;
      });
      _syncLiveSchedulePolling();
    } catch (e) {
      debugPrint('Athlete dashboard load failed: $e');
      if (mounted) {
        setState(() {
          _loading = false;
          _hasLoadedOnce = true;
          _error = 'Could not load your dashboard. Pull down to retry.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final row = _stats.isNotEmpty ? _stats.first : null;
    final gp = (row?['games_played'] as num?)?.toInt() ?? 0;
    final rawStats = row?['stats'] as Map<String, dynamic>?;
    final highlights = seasonStatHighlights(widget.sport, rawStats, gp);
    final prof = ref.watch(profileProvider).valueOrNull;
    final athlete = ref.watch(athleteRowProvider).valueOrNull;
    final fullName = prof?.fullName ?? 'Athlete';
    final initial = fullName.trim().isNotEmpty ? fullName.trim()[0].toUpperCase() : 'A';

    // Personal info rows (web parity: name + ID, course/year, department, position/jersey).
    final infoRows = <(String, String)>[
      if ((athlete?.studentId ?? '').trim().isNotEmpty) ('Student ID', athlete!.studentId!.trim()),
      if ((athlete?.department ?? prof?.department ?? '').trim().isNotEmpty)
        ('Department', (athlete?.department ?? prof?.department)!.trim()),
      if ((athlete?.yearLevel ?? '').trim().isNotEmpty)
        ('Year level', athlete!.yearLevel!.trim()),
      if ((athlete?.position ?? '').trim().isNotEmpty) ('Position', athlete!.position!.trim()),
      if ((athlete?.jerseyNumber ?? '').trim().isNotEmpty) ('Jersey', '#${athlete!.jerseyNumber!.trim()}'),
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppTheme.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
              ),
              child: Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
            ),
          // Personal info card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: LayoutTokens.cardBackground(context),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: LayoutTokens.borderSubtle(context)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: AppTheme.accent.withValues(alpha: 0.18),
                      child: Text(initial, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppTheme.accent)),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(fullName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Text(sportEmoji(widget.sport), style: const TextStyle(fontSize: 15)),
                              const SizedBox(width: 6),
                              Text(sportLabel(widget.sport),
                                  style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(context), fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (infoRows.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  ...infoRows.map((e) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 96,
                              child: Text(e.$1, style: TextStyle(fontSize: 13, color: LayoutTokens.mutedText(context))),
                            ),
                            Expanded(
                              child: Text(e.$2, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                      )),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          const _SectionHeader('Season snapshot'),
          if (row != null)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                StatChip(label: 'GP', value: '$gp'),
                ...highlights.map((h) => StatChip(label: h.label, value: h.value)),
              ],
            )
          else
            const _EmptyNote(icon: Icons.query_stats, text: 'Stats appear after your first game.'),
          const SizedBox(height: 24),
          const _SectionHeader('Upcoming & live'),
          if (_matches.isEmpty)
            const _EmptyNote(icon: Icons.event_available, text: 'No matches scheduled yet.')
          else
            ..._matches.map((m) {
              final ev = m['event'] as Map<String, dynamic>?;
              final title = ev?['name'] as String? ?? 'Match';
              final isLive = m['status'] == 'live';
              return Card(
                child: ListTile(
                  leading: Text(sportEmoji(ev?['sport'] as String? ?? widget.sport), style: const TextStyle(fontSize: 22)),
                  title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(
                    'vs ${_opponentLabel(m)}\n${matchStatusLabel(m['status'] as String? ?? '')} · ${formatDateTime(m['scheduled_at'] as String?)}',
                    style: TextStyle(color: LayoutTokens.secondaryText(context)),
                  ),
                  isThreeLine: true,
                  trailing: isLive
                      ? Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: AppTheme.danger.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
                          child: const Text('LIVE', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w900, fontSize: 10)),
                        )
                      : null,
                  onTap: m['event_id'] != null ? () => context.push('/events/${m['event_id']}') : null,
                ),
              );
            }),
          const SizedBox(height: 24),
          // The 🏆/🥈 note only means something once there are rows to carry a
          // badge, so it stays hidden while the section is empty.
          _SectionHeader(
            'Match history',
            subtitle: _pastMatches.isEmpty
                ? null
                : 'Completed bracket games. 🏆/🥈 means your team placed in that event.',
          ),
          if (_pastMatches.isEmpty)
            const _EmptyNote(icon: Icons.history, text: 'No completed games yet.')
          else
            ..._pastMatches.map((m) {
              final ev = m['event'] as Map<String, dynamic>?;
              final title = ev?['name'] as String? ?? 'Match';
              final evId = m['event_id'] as String?;
              final rank = evId != null ? _finishes[evId] : null;
              return Card(
                child: ListTile(
                  leading: Text(sportEmoji(ev?['sport'] as String? ?? widget.sport), style: const TextStyle(fontSize: 22)),
                  title: Row(
                    children: [
                      Flexible(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                      if (rank != null) ...[
                        const SizedBox(width: 8),
                        _PlacementBadge(rank: rank),
                      ],
                    ],
                  ),
                  subtitle: Text(
                    'vs ${_opponentLabel(m)}\n${formatDateTime(m['scheduled_at'] as String?)}',
                    style: TextStyle(color: LayoutTokens.secondaryText(context)),
                  ),
                  isThreeLine: true,
                  onTap: evId != null ? () => context.push('/events/$evId') : null,
                ),
              );
            }),
          const SizedBox(height: 24),
          _SectionHeader(
            'My team',
            subtitle: _teams.isEmpty ? null : 'Your squad and the coaching staff assigned to it.',
          ),
          if (_teams.isEmpty)
            const _EmptyNote(
              icon: Icons.groups_outlined,
              text: 'An organizer will add you to a roster.',
            )
          else
            ..._teams.map((g) => _TeamCard(group: g)),
        ],
      ),
    );
  }

  String? _opponentId(Map<String, dynamic> m) {
    final a = m['participant_a_id'] as String?;
    final b = m['participant_b_id'] as String?;
    // The opponent is the side that is NOT one of the athlete's teams.
    if (a != null && _teamIds.contains(a)) return b;
    if (b != null && _teamIds.contains(b)) return a;
    return b ?? a;
  }

  String _opponentLabel(Map<String, dynamic> m) {
    return participantDisplayLabel(_labels, _opponentId(m), fallbackPrefix: 'Team');
  }
}

/// Section title with an optional explanatory line. Callers pass `subtitle:
/// null` while a section is empty, so the dashboard doesn't stack a caption
/// explaining rows that aren't there on top of a message saying there are none.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(context)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Empty-section placeholder. Sitting in a bordered tile rather than as bare
/// muted text keeps a dashboard full of not-yet-populated sections reading as
/// structure instead of a wall of sentences.
class _EmptyNote extends StatelessWidget {
  const _EmptyNote({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: LayoutTokens.mutedText(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, color: LayoutTokens.mutedText(context)),
            ),
          ),
        ],
      ),
    );
  }
}

class _CoachContact {
  _CoachContact({required this.name, this.email});
  final String name;
  final String? email;
}

class _TeamGroup {
  _TeamGroup({required this.teamId, required this.teamName, required this.sport});
  final String teamId;
  final String teamName;
  final String sport;
  final List<_CoachContact> coaches = [];
  final List<Map<String, dynamic>> members = [];
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.group});
  final _TeamGroup group;

  @override
  Widget build(BuildContext context) {
    final sorted = group.members.toList()
      ..sort((a, b) => ((a['full_name'] as String?) ?? '').toLowerCase().compareTo(((b['full_name'] as String?) ?? '').toLowerCase()));
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: LayoutTokens.cardBackground(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: LayoutTokens.borderSubtle(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Tapping the header opens the full team page (record, roster, matches) —
            // the same destination the leaderboard and event screens already link to.
            InkWell(
              onTap: () => context.push('/teams/${group.teamId}'),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Text(sportEmoji(group.sport), style: const TextStyle(fontSize: 22)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(group.teamName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                          Text(sportLabel(group.sport), style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(context))),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, size: 18, color: LayoutTokens.mutedText(context)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            // Coaches
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.sports, size: 16, color: LayoutTokens.mutedText(context)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    group.coaches.isEmpty
                        ? 'No coach assigned yet.'
                        : 'Coach: ${group.coaches.map((c) => c.name).join(', ')}',
                    style: TextStyle(fontSize: 12.5, color: LayoutTokens.secondaryText(context), fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            if (sorted.isNotEmpty) ...[
              Divider(height: 20, color: LayoutTokens.borderSubtle(context)),
              ...sorted.asMap().entries.expand((entry) {
                final isFirst = entry.key == 0;
                final m = entry.value;
                final name = m['full_name'] as String? ?? 'Teammate';
                final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
                final pos = (m['position'] as String?)?.trim();
                final jersey = m['jersey_number']?.toString().trim();
                final meta = [
                  if (jersey != null && jersey.isNotEmpty) '#$jersey',
                  if (pos != null && pos.isNotEmpty) pos,
                ].join(' · ');
                final athleteId = m['id'] as String?;
                return [
                  if (!isFirst) Divider(height: 1, color: LayoutTokens.borderSubtle(context)),
                  InkWell(
                    onTap: athleteId != null ? () => context.push('/athletes/$athleteId') : null,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 14,
                            backgroundColor: AppTheme.accent.withValues(alpha: 0.12),
                            child: Text(
                              initial,
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppTheme.accent),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(child: Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                          if (meta.isNotEmpty)
                            Text(meta, style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(context))),
                          if (athleteId != null) ...[
                            const SizedBox(width: 6),
                            Icon(Icons.chevron_right, size: 16, color: LayoutTokens.mutedText(context)),
                          ],
                        ],
                      ),
                    ),
                  ),
                ];
              }),
            ],
          ],
        ),
      ),
    );
  }
}

class _PlacementBadge extends StatelessWidget {
  const _PlacementBadge({required this.rank});
  final int rank;

  @override
  Widget build(BuildContext context) {
    final isChampion = rank == 1;
    // Gold/silver medal convention — matches the podium card on the event detail screen.
    final color = isChampion ? AppTheme.warning : LayoutTokens.mutedText(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        isChampion ? '🏆 Champion' : '🥈 Runner-up',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}
