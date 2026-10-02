import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/coach_provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import '../../utils/error_helpers.dart';
import '../../utils/format_helpers.dart';
import '../../utils/live_match_presentation.dart';
import '../../utils/sport_helpers.dart';
import '../../widgets/ui/brand_page.dart';

/// The coach's home: the teams they are assigned to, what is being played now,
/// and what is next. Everything a coach needs courtside is a read; the few
/// edits they can make (jersey, position, starting lineup) live on the team
/// page itself, so this screen stays a list and a schedule.
class CoachHomeScreen extends ConsumerWidget {
  const CoachHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teamsAsync = ref.watch(coachTeamsProvider);
    final matchesAsync = ref.watch(coachMatchesProvider);

    final teams = teamsAsync.valueOrNull ?? const <CoachTeam>[];
    final live = teams.isEmpty
        ? const <Map<String, dynamic>>[]
        : (matchesAsync.valueOrNull ?? const <Map<String, dynamic>>[])
            .where((m) => m['status'] == 'live')
            .toList();

    return BrandPage.scroll(
      showBack: false,
      title: 'My Teams',
      actions: [
        HeroIconButton(
          tooltip: 'Settings',
          icon: Icons.settings_outlined,
          onPressed: () => context.push('/coach/settings'),
        ),
      ],
      hero: teamsAsync.hasValue
          ? FrostedCard(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
              child: FrostedStats(
                stats: [
                  (label: 'Teams', value: '${teams.length}'),
                  (label: 'Playing now', value: '${live.length}'),
                ],
              ),
            )
          : null,
      onRefresh: () async {
        ref.invalidate(coachTeamsProvider);
        ref.invalidate(coachMatchesProvider);
        await ref.read(coachTeamsProvider.future);
      },
      children: teamsAsync.when(
        loading: () => const [Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))],
        error: (e, _) => [SheetMessage(text: friendlyError(e), icon: Icons.cloud_off_rounded)],
        data: (teams) {
          final matches = matchesAsync.valueOrNull ?? const <Map<String, dynamic>>[];
          final live = matches.where((m) => m['status'] == 'live').toList();
          // The provider sorts newest-first; soonest-first reads better for a schedule.
          final upcoming = matches.where((m) => m['status'] == 'scheduled').toList().reversed.toList();
          final recent = matches.where((m) => m['status'] == 'completed').take(3).toList();

          return [
            if (teams.isEmpty) const _NoTeamsState(),
            if (live.isNotEmpty) ...[
              SectionHeader(
                title: 'Playing now',
                leading: Container(width: 9, height: 9, decoration: BoxDecoration(color: LayoutTokens.danger(context), shape: BoxShape.circle)),
              ),
              SheetGroup(children: [for (final m in live) _matchRow(context, m, highlight: true)]),
            ],
            if (upcoming.isNotEmpty) ...[
              const SectionHeader(title: 'Next up'),
              SheetGroup(children: [for (final m in upcoming.take(3)) _matchRow(context, m)]),
            ],
            if (teams.isNotEmpty) ...[
              SectionHeader(title: 'Teams (${teams.length})'),
              SheetGroup(children: [for (final t in teams) _teamRow(context, t)]),
            ],
            if (recent.isNotEmpty) ...[
              const SectionHeader(title: 'Recent results'),
              SheetGroup(children: [for (final m in recent) _matchRow(context, m)]),
            ],
          ];
        },
      ),
    );
  }

  Widget _teamRow(BuildContext context, CoachTeam team) {
    final starters = team.startingCount;
    final count = team.members.length;
    final subtitle = [
      '${sportLabel(team.sport)} · $count ${count == 1 ? 'player' : 'players'}',
      if (starters > 0) '$starters starting',
    ].join(' · ');
    return SheetTile(
      leading: IconTile(emoji: sportEmoji(team.sport), color: sportTint(context, team.sport)),
      title: team.name,
      subtitle: subtitle,
      trailing: Icon(Icons.chevron_right_rounded, size: 20, color: LayoutTokens.mutedText(context)),
      onTap: () => context.push('/teams/${team.id}'),
    );
  }

  Widget _matchRow(BuildContext context, Map<String, dynamic> match, {bool highlight = false}) {
    final event = match['event'] as Map<String, dynamic>?;
    final eventName = event?['name'] as String? ?? 'Match';
    final opponent = match['opponentName'] as String? ?? 'TBD';
    final status = match['status'] as String? ?? 'scheduled';
    final sport = event?['sport'] as String? ?? '';
    final when = formatDateTime(match['scheduled_at'] as String?);

    // A score is only meaningful once play has started.
    String? score;
    if (status == 'live' || status == 'completed') {
      final scores = (match['scores'] as List?)?.map((s) => Map<String, dynamic>.from(s as Map)).toList() ??
          const <Map<String, dynamic>>[];
      final myId = match['myParticipantId'] as String?;
      Map<String, dynamic>? mine;
      Map<String, dynamic>? theirs;
      for (final s in scores) {
        if (s['participant_id'] == myId) {
          mine ??= s;
        } else {
          theirs ??= s;
        }
      }
      if (mine != null && theirs != null) {
        score = '${matchResultScore(sport, mine)} - ${matchResultScore(sport, theirs)}';
      }
    }

    return SheetTile(
      leading: IconTile(
        emoji: sportEmoji(sport),
        color: highlight ? LayoutTokens.danger(context) : sportTint(context, sport),
      ),
      title: 'vs $opponent',
      subtitle: when.isEmpty ? eventName : '$eventName · $when',
      onTap: () {
        final eventId = match['event_id'] as String?;
        if (eventId != null) context.push('/events/$eventId?tab=matches');
      },
      trailing: score != null
          ? Text(score, style: AppTheme.display(size: 17, color: LayoutTokens.primaryText(context), height: 1))
          : Text(
              matchStatusLabel(status),
              style: TextStyle(color: LayoutTokens.mutedText(context), fontWeight: FontWeight.w700, fontSize: 12),
            ),
    );
  }
}

class _NoTeamsState extends StatelessWidget {
  const _NoTeamsState();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: SheetMessage(
          icon: Icons.groups_outlined,
          text: 'No teams assigned yet\n\n'
              'Teams you create on the web platform are yours automatically, and the '
              'Super Admin or your sport\'s organizer can add you to others. '
              'Once you are on a team, its roster and schedule show up here.',
        ),
      );
}
