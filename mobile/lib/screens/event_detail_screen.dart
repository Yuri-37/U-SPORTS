import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/events_api_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/event_placements.dart';
import '../utils/format_helpers.dart';
import '../utils/participant_labels.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';
import '../widgets/match_roster_stats.dart';
import '../widgets/tournament_bracket_view.dart';
import '../widgets/ui/animated_score.dart';
import '../widgets/ui/brand_page.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  const EventDetailScreen({super.key, required this.eventId, this.initialTab = 0});

  final String eventId;
  final int initialTab;

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Map<String, String> _labels = {};
  Map<String, String> _types = {};
  String _labelSig = '';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this, initialIndex: widget.initialTab.clamp(0, 1));
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _resolveLabels(
    List<Map<String, dynamic>> brackets,
    List<Map<String, dynamic>> matches,
    Map<String, dynamic>? event,
  ) async {
    final ids = <String>{
      ...collectBracketParticipantIds(brackets),
      ...matches
          .expand((m) => [m['participant_a_id'], m['participant_b_id']])
          .whereType<String>()
          .where((id) => id.isNotEmpty),
      ...collectEventParticipantIds(event),
    };
    final sig = ids.join(',');
    if (sig == _labelSig) return;
    _labelSig = sig;
    if (ids.isEmpty) {
      if (mounted) setState(() => _labels = {});
      return;
    }
    final map = await fetchParticipantLabels(ids.toList());
    if (mounted) setState(() => _labels = map);
    final types = await fetchParticipantTypes(ids.toList());
    if (mounted) setState(() => _types = types);
  }

  String _slotLabel(String? id) => participantDisplayLabel(_labels, id);

  /// Standings rows link to a team/athlete page once its type is known;
  /// null (no tap) while that lookup is still in flight or unresolved.
  VoidCallback? _tapHandlerFor(String participantId) {
    final type = _types[participantId];
    if (type == null) return null;
    return () => context.push(type == 'team' ? '/teams/$participantId' : '/athletes/$participantId');
  }

  String? _participantIdForMatch(Map<String, dynamic> match, List<Map<String, dynamic>> brackets, String slot) {
    final direct = slot == 'a' ? match['participant_a_id'] : match['participant_b_id'];
    if (direct is String && direct.isNotEmpty) return direct;
    final bracketId = match['bracket_id'] as String?;
    if (bracketId == null) return null;
    for (final b in brackets) {
      if (b['id'] == bracketId) {
        final id = slot == 'a' ? b['participant_a_id'] : b['participant_b_id'];
        if (id is String && id.isNotEmpty) return id;
      }
    }
    return null;
  }

  void _showMatchSheet(BuildContext context, String matchId) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.5,
          minChildSize: 0.35,
          maxChildSize: 0.92,
          builder: (_, scroll) {
            return Consumer(
              builder: (context, ref, _) {
                final st = ref.watch(scoringStateProvider(matchId));
                return st.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => Padding(padding: const EdgeInsets.all(24), child: Text(friendlyError(e))),
                  data: (data) {
                    final names = data['participantNames'] as Map<String, dynamic>? ?? {};
                    final match = data['match'] as Map<String, dynamic>? ?? {};
                    final status = match['status'] as String? ?? '';
                    final scores = (data['scores'] as List<dynamic>? ?? [])
                        .map((e) => Map<String, dynamic>.from(e as Map))
                        .toList();
                    // NOTE: the `matches` table has no `sport` column — read it from the
                    // score rows (which carry `sport`), falling back to the match if present.
                    final sport = (scores.isNotEmpty ? scores.first['sport'] as String? : null) ??
                        (match['sport'] as String?) ??
                        '';
                    final nameA = names['a'] as String? ?? 'Side A';
                    final nameB = names['b'] as String? ?? 'Side B';

                    final pidA = match['participant_a_id'] as String? ?? '';
                    final pidB = match['participant_b_id'] as String? ?? '';

                    // match_scores stores per-period columns (q1,q2,q3,q4,ot / set1..set5 / game1..game5)
                    List<String> periodFields(String s) {
                      if (s == 'basketball') return ['q1', 'q2', 'q3', 'q4', 'ot'];
                      if (s == 'volleyball') return ['set1', 'set2', 'set3', 'set4', 'set5'];
                      return ['game1', 'game2', 'game3', 'game4', 'game5'];
                    }
                    String periodLabel(String s, int idx) {
                      if (s == 'basketball') return ['Q1', 'Q2', 'Q3', 'Q4', 'OT'][idx];
                      if (s == 'volleyball') return 'Set ${idx + 1}';
                      return 'Game ${idx + 1}';
                    }

                    final fields = periodFields(sport);
                    int rowTotal(Map<String, dynamic> row) =>
                        fields.fold(0, (sum, f) => sum + ((row[f] as num?)?.toInt() ?? 0));

                    // Each row = one participant's scores across all periods
                    Map<String, dynamic>? rowA;
                    Map<String, dynamic>? rowB;
                    for (final s in scores) {
                      final pid = s['participant_id'] as String?;
                      if (pid == pidA) rowA = s;
                      if (pid == pidB) rowB = s;
                    }
                    final totalA = rowA != null ? rowTotal(rowA) : 0;
                    final totalB = rowB != null ? rowTotal(rowB) : 0;

                    // Build period breakdown — only periods where at least one side scored
                    final byPeriod = <int, Map<String, int>>{};
                    for (var i = 0; i < fields.length; i++) {
                      final f = fields[i];
                      final va = (rowA?[f] as num?)?.toInt() ?? 0;
                      final vb = (rowB?[f] as num?)?.toInt() ?? 0;
                      if (va > 0 || vb > 0) {
                        byPeriod[i] = {if (pidA.isNotEmpty) pidA: va, if (pidB.isNotEmpty) pidB: vb};
                      }
                    }
                    final periods = byPeriod.keys.toList()..sort();

                    final isLive = status == 'live';
                    final isCompleted = status == 'completed';

                    final statusColor = isLive
                        ? LayoutTokens.danger(context)
                        : isCompleted
                            ? LayoutTokens.success(context)
                            : AppTheme.brandInk(context);
                    final b = Theme.of(context).brightness;

                    return ListView(
                      controller: scroll,
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      children: [
                        // Handle bar
                        Center(
                          child: Container(
                            width: 40, height: 4,
                            decoration: BoxDecoration(
                              color: LayoutTokens.borderSubtle(context),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Sport + status row
                        Row(
                          children: [
                            Icon(sportIcon(sport), size: 18, color: LayoutTokens.secondaryText(context)),
                            const SizedBox(width: 8),
                            Text(sportLabel(sport), style: TextStyle(color: LayoutTokens.secondaryText(context), fontSize: 13)),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: statusColor.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                matchStatusLabel(status),
                                style: AppTheme.overline(statusColor).copyWith(fontSize: 11),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        // Big scoreboard
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                          decoration: BoxDecoration(
                            color: LayoutTokens.cardBackground(context),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: AppTheme.cardShadow(b),
                            border: b == Brightness.dark ? Border.all(color: LayoutTokens.borderSubtle(context)) : null,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  children: [
                                    Text(nameA, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 10),
                                    AnimatedScore(
                                        value: totalA,
                                        style: AppTheme.display(
                                            size: 44,
                                            color: isCompleted && totalA > totalB ? LayoutTokens.success(context) : LayoutTokens.primaryText(context)),
                                        textAlign: TextAlign.center),
                                  ],
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                                child: Text('vs', style: TextStyle(fontSize: 16, color: LayoutTokens.mutedText(context), fontWeight: FontWeight.w600)),
                              ),
                              Expanded(
                                child: Column(
                                  children: [
                                    Text(nameB, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 10),
                                    AnimatedScore(
                                        value: totalB,
                                        style: AppTheme.display(
                                            size: 44,
                                            color: isCompleted && totalB > totalA ? LayoutTokens.success(context) : LayoutTokens.primaryText(context)),
                                        textAlign: TextAlign.center),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Per-period breakdown
                        if (periods.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Text('Period breakdown', style: AppTheme.overline(LayoutTokens.mutedText(context))),
                          const SizedBox(height: 8),
                          ...periods.map((p) {
                            final pa = byPeriod[p]?[pidA] ?? 0;
                            final pb = byPeriod[p]?[pidB] ?? 0;
                            final label = periodLabel(sport, p);
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  SizedBox(width: 60, child: Text('$pa', style: const TextStyle(fontWeight: FontWeight.w600), textAlign: TextAlign.center)),
                                  Expanded(child: Text(label, style: TextStyle(color: LayoutTokens.secondaryText(context), fontSize: 12), textAlign: TextAlign.center)),
                                  SizedBox(width: 60, child: Text('$pb', style: const TextStyle(fontWeight: FontWeight.w600), textAlign: TextAlign.center)),
                                ],
                              ),
                            );
                          }),
                        ],
                        MatchRosterStats(matchId: matchId, sport: sport, nameA: nameA, nameB: nameB),
                        if (scores.isEmpty && !isLive) ...[
                          const SizedBox(height: 16),
                          Center(child: Text('No score data recorded for this match.', style: TextStyle(color: LayoutTokens.mutedText(context), fontSize: 13))),
                        ],
                        const SizedBox(height: 12),
                        TextButton.icon(
                          onPressed: () {
                            ref.invalidate(scoringStateProvider(matchId));
                            ref.invalidate(matchRosterProvider(matchId));
                          },
                          icon: const Icon(Icons.refresh, size: 16),
                          label: const Text('Refresh', style: TextStyle(fontSize: 13)),
                        ),
                      ],
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final evAsync = ref.watch(eventDetailProvider(widget.eventId));
    final brAsync = ref.watch(bracketsForEventProvider(widget.eventId));
    final mtAsync = ref.watch(matchesForEventProvider(widget.eventId));

    void back() {
      if (context.canPop()) {
        context.pop();
      } else {
        context.go('/');
      }
    }

    return evAsync.when(
      loading: () => BrandPage.fixed(
        title: 'Event',
        showBack: true,
        onBack: back,
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => BrandPage.fixed(
        title: 'Event',
        showBack: true,
        onBack: back,
        body: SheetMessage(text: friendlyError(e)),
      ),
      data: (event) {
        if (event == null) {
          return BrandPage.fixed(
            title: 'Event',
            showBack: true,
            onBack: back,
            body: const SheetMessage(text: 'Event not found'),
          );
        }
        final sport = event['sport'] as String? ?? '';
        final name = event['name'] as String? ?? 'Event';
        final status = event['status'] as String? ?? '';
        final desc = event['description'] as String?;

        final brackets = brAsync.valueOrNull ?? [];
        final matches = mtAsync.valueOrNull ?? [];
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _resolveLabels(brackets, matches, event);
        });
        final standings = deriveFullEventStandings(brackets);

        return BrandPage.fixed(
          title: name,
          subtitle: '${sportLabel(sport)} · ${formatEnumLabel(event['format'] as String? ?? '')}',
          showBack: true,
          onBack: back,
          actions: [
            HeroPill(
              text: eventPublicLifecycleLabel(status),
              dotColor: status == 'in_progress' ? AppTheme.danger : AppTheme.schoolSecondary,
            ),
          ],
          bottom: BrandTabBar(
            controller: _tabs,
            tabs: ['Bracket', 'Matches (${matches.length})'],
          ),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (desc != null && desc.trim().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                  child: Text(
                    desc,
                    style: TextStyle(fontSize: 13.5, height: 1.5, color: LayoutTokens.secondaryText(context)),
                  ),
                ),
              if (standings != null && status == 'completed')
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SectionHeader(title: 'Final rankings', padding: EdgeInsets.only(bottom: 12)),
                      SheetGroup(
                        children: [
                          for (var i = 0; i < standings.length && i < 2; i++)
                            _PodiumRow(
                              rank: standings[i].rank,
                              name: _slotLabel(standings[i].participantId),
                              onTap: _tapHandlerFor(standings[i].participantId),
                            ),
                          for (var i = 2; i < standings.length; i++)
                            _StandingsRow(
                              rank: standings[i].rank,
                              name: _slotLabel(standings[i].participantId),
                              onTap: _tapHandlerFor(standings[i].participantId),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(bracketsForEventProvider(widget.eventId));
                        ref.invalidate(eventDetailProvider(widget.eventId));
                      },
                      child: brackets.isEmpty
                          ? ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              children: const [SheetMessage(text: 'No bracket generated yet.')],
                            )
                          : InteractiveViewer(
                              boundaryMargin: const EdgeInsets.all(48),
                              minScale: 0.4,
                              maxScale: 2.5,
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: TournamentBracketView(
                                  brackets: brackets,
                                  matches: matches,
                                  participantLabels: _labels,
                                  onMatchTap: (m) {
                                    final id = m['id'] as String?;
                                    if (id != null) _showMatchSheet(context, id);
                                  },
                                ),
                              ),
                            ),
                    ),
                    RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(matchesForEventProvider(widget.eventId));
                      },
                      child: matches.isEmpty
                          ? ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              children: const [SheetMessage(text: 'No matches yet.')],
                            )
                          : ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                              children: [
                                SheetGroup(
                                  children: [
                                    for (final m in matches) _matchRow(context, m, brackets, sport),
                                  ],
                                ),
                              ],
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _matchRow(
    BuildContext context,
    Map<String, dynamic> m,
    List<Map<String, dynamic>> brackets,
    String sport,
  ) {
    final idA = _participantIdForMatch(m, brackets, 'a');
    final idB = _participantIdForMatch(m, brackets, 'b');
    final na = _slotLabel(idA);
    final nb = _slotLabel(idB);
    final st = m['status'] as String? ?? '';
    final mid = m['id'] as String;
    // A scheduled match still waiting for its teams has nothing to show yet.
    final waiting = st == 'scheduled' && (idA == null || idB == null);
    final canOpen = !waiting && (st == 'live' || st == 'scheduled' || st == 'completed');
    return SheetTile(
      leading: IconTile(icon: sportIcon(sport), color: sportTint(context, sport), size: 40),
      title: '$na vs $nb',
      subtitle:
          '${waiting ? 'Waiting for teams' : matchStatusLabel(st)}${m['scheduled_at'] != null ? ' · ${formatDateTime(m['scheduled_at'] as String?)}' : ''}',
      onTap: canOpen ? () => _showMatchSheet(context, mid) : null,
      trailing: st == 'live'
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: LayoutTokens.danger(context).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'Live',
                style: TextStyle(
                  color: LayoutTokens.danger(context),
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            )
          : canOpen
              ? Icon(Icons.info_outline_rounded, color: LayoutTokens.mutedText(context))
              : null,
    );
  }
}

class _PodiumRow extends StatelessWidget {
  const _PodiumRow({required this.rank, required this.name, this.onTap});

  final int rank;
  final String name;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isChampion = rank == 1;
    final rankColor = isChampion ? LayoutTokens.warning(context) : LayoutTokens.mutedText(context);
    return SheetTile(
      leading: IconTile(
        icon: isChampion ? Icons.emoji_events_rounded : Icons.military_tech_rounded,
        color: rankColor,
        size: 42,
      ),
      title: name,
      subtitle: placementRankLabel(rank),
      onTap: onTap,
      trailing: onTap != null
          ? Icon(Icons.chevron_right_rounded, size: 20, color: LayoutTokens.mutedText(context))
          : null,
    );
  }
}

/// Everyone past champion/runner-up — a numbered row rather than the
/// trophy/medal treatment above (mirrors web's EventPodiumStrip split).
class _StandingsRow extends StatelessWidget {
  const _StandingsRow({required this.rank, required this.name, this.onTap});

  final int rank;
  final String name;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SheetTile(
      leading: SizedBox(
        width: 42,
        child: Text(
          placementRankLabel(rank),
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: LayoutTokens.mutedText(context)),
        ),
      ),
      title: name,
      onTap: onTap,
      trailing: onTap != null
          ? Icon(Icons.chevron_right_rounded, size: 18, color: LayoutTokens.mutedText(context))
          : null,
    );
  }
}
