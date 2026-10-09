import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import '../../utils/event_placements.dart';
import '../../utils/format_helpers.dart';
import '../../utils/participant_labels.dart';
import '../../utils/sport_helpers.dart';
import '../../widgets/double_back_exit.dart';
import '../../widgets/stat_chip.dart';
import '../../widgets/avatar_upload_button.dart';
import '../../widgets/ui/brand_page.dart';
import '../../widgets/ui/hub_header_actions.dart';
import '../../utils/error_helpers.dart';

class AthleteDashboardScreen extends ConsumerWidget {
  const AthleteDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteAsync = ref.watch(athleteRowProvider);

    return DoubleBackToExit(
      child: athleteAsync.when(
        loading: () => const BrandPage.fixed(
          showBack: false,
          title: 'Dashboard',
          body: Center(child: CircularProgressIndicator()),
        ),
        error: (e, _) => BrandPage.fixed(
          showBack: false,
          title: 'Dashboard',
          body: SheetMessage(text: friendlyError(e)),
        ),
        data: (athlete) {
          if (athlete == null) {
            return const BrandPage.fixed(
              showBack: false,
              title: 'Dashboard',
              body: SheetMessage(text: 'Athlete profile not found.'),
            );
          }
          return _AthleteDashboardBody(athleteId: athlete.id, sport: athlete.sport);
        },
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
    final row = _stats.isNotEmpty ? _stats.first : null;
    final gp = (row?['games_played'] as num?)?.toInt() ?? 0;
    final rawStats = row?['stats'] as Map<String, dynamic>?;
    final highlights = seasonStatHighlights(widget.sport, rawStats, gp);
    final prof = ref.watch(profileProvider).valueOrNull;
    final athlete = ref.watch(athleteRowProvider).valueOrNull;
    final fullName = prof?.fullName ?? 'Athlete';
    final avatarUrl = prof?.avatarUrl;

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

    return BrandPage.scroll(
      showBack: false,
      title: 'Dashboard',
      actions: const [HubHeaderActions()],
      onRefresh: _load,
      hero: Column(
        children: [
          // Tappable: this is the only place an athlete can change their photo,
          // since /athlete/profile is deprecated in favour of this dashboard.
          AvatarUploadButton(
            avatarUrl: avatarUrl,
            fallbackInitial: fullName.trim().isNotEmpty ? fullName.trim()[0].toUpperCase() : '?',
            radius: 34,
          ),
          const SizedBox(height: 12),
          Text(fullName, textAlign: TextAlign.center, style: AppTheme.display(size: 21, color: Colors.white)),
          const SizedBox(height: 4),
          Text(
            sportLabel(widget.sport),
            style: TextStyle(color: Colors.white.withValues(alpha: 0.78), fontSize: 13, fontWeight: FontWeight.w600),
          ),
          if (infoRows.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: infoRows.map((e) => _heroTag('${e.$1}: ${e.$2}')).toList(),
            ),
          ],
        ],
      ),
      children: [
        if (_loading)
          const Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Center(child: CircularProgressIndicator()))
        else ...[
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: LayoutTokens.danger(context).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: LayoutTokens.danger(context).withValues(alpha: 0.3)),
                ),
                child: Text(_error!, style: TextStyle(color: LayoutTokens.danger(context), fontSize: 13)),
              ),
            ),
          const SectionHeader(title: 'Season snapshot', padding: EdgeInsets.only(bottom: 12)),
          if (row != null)
            SheetGroup(
              padding: const EdgeInsets.all(16),
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  alignment: WrapAlignment.center,
                  children: [
                    StatChip(label: 'GP', value: '$gp'),
                    for (var i = 0; i < highlights.length; i++)
                      StatChip(label: highlights[i].label, value: highlights[i].value, emphasis: i == 0),
                  ],
                ),
              ],
            )
          else
            const SheetMessage(icon: Icons.query_stats_rounded, text: 'Stats appear after your first game.'),
          const SectionHeader(title: 'Upcoming & live'),
          if (_matches.isEmpty)
            const SheetMessage(icon: Icons.event_available_rounded, text: 'No matches scheduled yet.')
          else
            SheetGroup(children: [for (final m in _matches) _upcomingMatchRow(context, m)]),
          // The placement note only means something once there are rows to carry a
          // badge, so it stays hidden while the section is empty.
          SectionHeader(
            title: 'Match history',
            trailing: _pastMatches.isEmpty ? null : const Icon(Icons.emoji_events_outlined, size: 18),
          ),
          if (_pastMatches.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'Completed bracket games. A Champion or Runner-up badge means your team placed in that event.',
                style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(context)),
              ),
            ),
          if (_pastMatches.isEmpty)
            const SheetMessage(icon: Icons.history_rounded, text: 'No completed games yet.')
          else
            SheetGroup(children: [for (final m in _pastMatches) _pastMatchRow(context, m)]),
          SectionHeader(
            title: 'My team',
            trailing: _teams.isEmpty
                ? null
                : Text('Coaching staff', style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(context))),
          ),
          if (_teams.isEmpty)
            const SheetMessage(icon: Icons.groups_outlined, text: 'An organizer will add you to a roster.')
          else
            for (final g in _teams) _TeamCard(group: g),
        ],
      ],
    );
  }

  Widget _heroTag(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
      ),
      child: Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Colors.white)),
    );
  }

  Widget _upcomingMatchRow(BuildContext context, Map<String, dynamic> m) {
    final ev = m['event'] as Map<String, dynamic>?;
    final title = ev?['name'] as String? ?? 'Match';
    final sport = ev?['sport'] as String? ?? widget.sport;
    final isLive = m['status'] == 'live';
    // Same wording as the web dashboard when a bracket match has no time yet.
    final scheduledAt = m['scheduled_at'] as String?;
    final String? when = (scheduledAt != null && scheduledAt.isNotEmpty)
        ? formatDateTime(scheduledAt)
        : (m['status'] == 'scheduled' ? 'Date and time not set yet' : null);
    return SheetTile(
      leading: IconTile(icon: sportIcon(sport), color: isLive ? LayoutTokens.danger(context) : sportTint(context, sport)),
      title: title,
      subtitle: [
        'vs ${_opponentLabel(m)}',
        matchStatusLabel(m['status'] as String? ?? ''),
        if (when != null) when,
      ].join(' · '),
      titleMaxLines: 1,
      onTap: m['event_id'] != null ? () => context.push('/events/${m['event_id']}') : null,
      trailing: isLive
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: LayoutTokens.danger(context).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
              child: Text('LIVE', style: AppTheme.overline(LayoutTokens.danger(context)).copyWith(fontSize: 10.5)),
            )
          : null,
    );
  }

  Widget _pastMatchRow(BuildContext context, Map<String, dynamic> m) {
    final ev = m['event'] as Map<String, dynamic>?;
    final title = ev?['name'] as String? ?? 'Match';
    final sport = ev?['sport'] as String? ?? widget.sport;
    final evId = m['event_id'] as String?;
    final rank = evId != null ? _finishes[evId] : null;
    final scheduledAt = m['scheduled_at'] as String?;
    final when = (scheduledAt != null && scheduledAt.isNotEmpty) ? formatDateTime(scheduledAt) : 'Date not recorded';
    return SheetTile(
      leading: IconTile(icon: sportIcon(sport), color: sportTint(context, sport)),
      title: title,
      subtitle: 'vs ${_opponentLabel(m)} · $when',
      onTap: evId != null ? () => context.push('/events/$evId') : null,
      trailing: rank != null ? _PlacementBadge(rank: rank) : null,
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
    final tint = sportTint(context, group.sport);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SheetGroup(
        children: [
          // Tapping the header opens the full team page (record, roster, matches) —
          // the same destination the leaderboard and event screens already link to.
          SheetTile(
            leading: IconTile(icon: sportIcon(group.sport), color: tint),
            title: group.teamName,
            subtitle: sportLabel(group.sport),
            onTap: () => context.push('/teams/${group.teamId}'),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
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
          ),
          for (final m in sorted) _memberRow(context, m, tint),
        ],
      ),
    );
  }

  Widget _memberRow(BuildContext context, Map<String, dynamic> m, Color tint) {
    final name = m['full_name'] as String? ?? 'Teammate';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final pos = (m['position'] as String?)?.trim();
    final jersey = m['jersey_number']?.toString().trim();
    final meta = [
      if (jersey != null && jersey.isNotEmpty) '#$jersey',
      if (pos != null && pos.isNotEmpty) pos,
    ].join(' · ');
    final athleteId = m['id'] as String?;
    return SheetTile(
      leading: CircleAvatar(
        radius: 16,
        backgroundColor: tint.withValues(alpha: 0.14),
        child: Text(initial, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: tint)),
      ),
      title: name,
      subtitle: meta.isNotEmpty ? meta : null,
      onTap: athleteId != null ? () => context.push('/athletes/$athleteId') : null,
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
    final color = isChampion ? LayoutTokens.warning(context) : LayoutTokens.mutedText(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isChampion ? Icons.emoji_events_rounded : Icons.military_tech_rounded,
            size: 11,
            color: color,
          ),
          const SizedBox(width: 4),
          Text(
            isChampion ? 'Champion' : 'Runner-up',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
          ),
        ],
      ),
    );
  }
}
