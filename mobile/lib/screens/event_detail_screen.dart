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
  }

  String _slotLabel(String? id) => participantDisplayLabel(_labels, id);

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

                    return ListView(
                      controller: scroll,
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      children: [
                        // Handle bar
                        Center(
                          child: Container(
                            width: 40, height: 4,
                            decoration: BoxDecoration(
                              color: LayoutTokens.mutedText(context),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Sport + status row
                        Row(
                          children: [
                            Text(sportEmoji(sport), style: const TextStyle(fontSize: 18)),
                            const SizedBox(width: 8),
                            Text(sportLabel(sport), style: TextStyle(color: LayoutTokens.secondaryText(context), fontSize: 13)),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: isLive
                                    ? AppTheme.danger.withValues(alpha: 0.15)
                                    : isCompleted
                                        ? LayoutTokens.success(context).withValues(alpha: 0.12)
                                        : AppTheme.accent.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                matchStatusLabel(status),
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: isLive ? AppTheme.danger : isCompleted ? LayoutTokens.success(context) : AppTheme.accent,
                                ),
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
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: LayoutTokens.borderSubtle(context)),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  children: [
                                    Text(nameA, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 10),
                                    Text('$totalA', style: TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: isCompleted && totalA > totalB ? LayoutTokens.success(context) : Theme.of(context).colorScheme.onSurface), textAlign: TextAlign.center),
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
                                    Text('$totalB', style: TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: isCompleted && totalB > totalA ? LayoutTokens.success(context) : Theme.of(context).colorScheme.onSurface), textAlign: TextAlign.center),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Per-period breakdown
                        if (periods.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Text('Period breakdown', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: LayoutTokens.secondaryText(context))),
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
                          onPressed: () => ref.invalidate(scoringStateProvider(matchId)),
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

    return evAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text(friendlyError(e)))),
      data: (event) {
        if (event == null) {
          return const Scaffold(body: Center(child: Text('Event not found')));
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
        final podium = deriveEliminationPodium(brackets);

        return Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/');
                }
              },
            ),
            bottom: TabBar(
              controller: _tabs,
              tabs: [
                const Tab(text: 'Bracket'),
                Tab(text: 'Matches (${matches.length})'),
              ],
            ),
          ),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(sportEmoji(sport), style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${sportLabel(sport)} · ${formatEnumLabel(event['format'] as String? ?? '')}',
                            style: TextStyle(color: LayoutTokens.secondaryText(context), fontSize: 13),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.accent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            eventPublicLifecycleLabel(status),
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.accent),
                          ),
                        ),
                      ],
                    ),
                    if (desc != null && desc.trim().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text(desc, style: const TextStyle(fontSize: 13)),
                      ),
                    if (podium != null && status == 'completed') ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: LayoutTokens.cardBackground(context),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: LayoutTokens.borderSubtle(context)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (var i = 0; i < podium.length; i++) ...[
                              if (i > 0) const SizedBox(height: 10),
                              _PodiumRow(rank: podium[i].rank, name: _slotLabel(podium[i].participantId)),
                            ],
                          ],
                        ),
                      ),
                    ],
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
                              children: [
                                const SizedBox(height: 32),
                                Center(child: Text('No bracket generated yet.', style: TextStyle(color: LayoutTokens.mutedText(context)))),
                              ],
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
                              children: [
                                const SizedBox(height: 32),
                                Center(child: Text('No matches scheduled.', style: TextStyle(color: LayoutTokens.mutedText(context)))),
                              ],
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: matches.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 8),
                              itemBuilder: (ctx, i) {
                                final m = matches[i];
                                final a = _participantIdForMatch(m, brackets, 'a');
                                final bId = _participantIdForMatch(m, brackets, 'b');
                                final na = _slotLabel(a);
                                final nb = _slotLabel(bId);
                                final st = m['status'] as String? ?? '';
                                final mid = m['id'] as String;
                                return Material(
                                  color: LayoutTokens.cardBackground(context),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                                  ),
                                  child: ListTile(
                                    title: Text('$na vs $nb'),
                                    subtitle: Text(
                                      '${matchStatusLabel(st)}${m['scheduled_at'] != null ? ' · ${formatDateTime(m['scheduled_at'] as String?)}' : ''}',
                                    ),
                                    trailing: st == 'live'
                                        ? TextButton(
                                            onPressed: () => _showMatchSheet(context, mid),
                                            child: const Text('Live'),
                                          )
                                        : st == 'scheduled' || st == 'completed'
                                            ? IconButton(
                                                icon: const Icon(Icons.info_outline),
                                                onPressed: () => _showMatchSheet(context, mid),
                                              )
                                            : null,
                                  ),
                                );
                              },
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
}

class _PodiumRow extends StatelessWidget {
  const _PodiumRow({required this.rank, required this.name});

  final int rank;
  final String name;

  @override
  Widget build(BuildContext context) {
    final isChampion = rank == 1;
    final rankColor = isChampion ? AppTheme.warning : LayoutTokens.mutedText(context);
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: rankColor.withValues(alpha: 0.15), shape: BoxShape.circle),
          child: Icon(isChampion ? Icons.emoji_events : Icons.military_tech, color: rankColor, size: 20),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                placementRankLabel(rank),
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: LayoutTokens.secondaryText(context)),
              ),
              Text(
                name,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.onSurface),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
