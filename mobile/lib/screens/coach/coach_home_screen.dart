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

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('My Teams'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/coach/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(coachTeamsProvider);
          ref.invalidate(coachMatchesProvider);
          await ref.read(coachTeamsProvider.future);
        },
        child: teamsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorState(message: friendlyError(e)),
          data: (teams) {
            final matches =
                matchesAsync.valueOrNull ?? const <Map<String, dynamic>>[];
            final live = matches.where((m) => m['status'] == 'live').toList();
            // The provider sorts newest-first; soonest-first reads better
            // for a schedule.
            final upcoming = matches
                .where((m) => m['status'] == 'scheduled')
                .toList()
                .reversed
                .toList();
            final recent =
                matches.where((m) => m['status'] == 'completed').take(3).toList();

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (teams.isEmpty) const _NoTeamsState(),
                if (live.isNotEmpty) ...[
                  const _SectionTitle('Playing now'),
                  ...live.map((m) => _MatchTile(match: m, highlight: true)),
                  const SizedBox(height: 20),
                ],
                if (upcoming.isNotEmpty) ...[
                  const _SectionTitle('Next up'),
                  ...upcoming.take(3).map((m) => _MatchTile(match: m)),
                  const SizedBox(height: 20),
                ],
                if (teams.isNotEmpty) ...[
                  _SectionTitle('Teams (${teams.length})'),
                  ...teams.map((t) => _TeamCard(team: t)),
                ],
                if (recent.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  const _SectionTitle('Recent results'),
                  ...recent.map((m) => _MatchTile(match: m)),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(text,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
      );
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.team});
  final CoachTeam team;

  @override
  Widget build(BuildContext context) {
    final starters = team.startingCount;
    final count = team.members.length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => context.push('/teams/${team.id}'),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: AppTheme.schoolPrimary,
              child: Text(sportEmoji(team.sport),
                  style: const TextStyle(fontSize: 18)),
            ),
            title:
                Text(team.name, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
              '${sportLabel(team.sport)} - $count ${count == 1 ? 'player' : 'players'}'
              '${starters > 0 ? ' - $starters starting' : ''}',
              style: TextStyle(color: LayoutTokens.secondaryText(context)),
            ),
            trailing: const Icon(Icons.chevron_right, size: 20),
          ),
        ),
      ),
    );
  }
}

class _MatchTile extends StatelessWidget {
  const _MatchTile({required this.match, this.highlight = false});
  final Map<String, dynamic> match;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final event = match['event'] as Map<String, dynamic>?;
    final eventName = event?['name'] as String? ?? 'Match';
    final opponent = match['opponentName'] as String? ?? 'TBD';
    final status = match['status'] as String? ?? 'scheduled';
    final when = formatDateTime(match['scheduled_at'] as String?);

    // A score is only meaningful once play has started.
    String? score;
    if (status == 'live' || status == 'completed') {
      final scores = (match['scores'] as List?)
              ?.map((s) => Map<String, dynamic>.from(s as Map))
              .toList() ??
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
      final sport = event?['sport'] as String? ?? '';
      if (mine != null && theirs != null) {
        score = '${matchResultScore(sport, mine)} - '
            '${matchResultScore(sport, theirs)}';
      }
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: highlight
            ? AppTheme.danger.withValues(alpha: 0.08)
            : LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            final eventId = match['event_id'] as String?;
            if (eventId != null) context.push('/events/$eventId?tab=matches');
          },
          child: ListTile(
            title: Text('vs $opponent',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
              when.isEmpty ? eventName : '$eventName - $when',
              style: TextStyle(color: LayoutTokens.secondaryText(context)),
            ),
            trailing: score != null
                ? Text(score,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15))
                : Text(
                    matchStatusLabel(status),
                    style: TextStyle(
                      color: LayoutTokens.mutedText(context),
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _NoTeamsState extends StatelessWidget {
  const _NoTeamsState();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48),
        child: Column(
          children: [
            Icon(Icons.groups_outlined,
                size: 48, color: LayoutTokens.mutedText(context)),
            const SizedBox(height: 12),
            const Text('No teams assigned yet',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 6),
            Text(
              'An organizer assigns coaches to teams on the web platform. '
              'Once you are added, your roster and schedule show up here.',
              textAlign: TextAlign.center,
              style: TextStyle(color: LayoutTokens.secondaryText(context)),
            ),
          ],
        ),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(32),
        children: [
          const SizedBox(height: 48),
          Icon(Icons.cloud_off, size: 44, color: LayoutTokens.mutedText(context)),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
        ],
      );
}
