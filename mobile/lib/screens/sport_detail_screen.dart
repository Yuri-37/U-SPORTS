import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/events_api_provider.dart';
import '../providers/leaderboard_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/leaderboard_stats.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';
import '../widgets/event_card.dart';

/// Drill-down page for a single sport, reached from Home's "Browse by Sport"
/// cards. A real pushed route (back arrow, no tab-switch ambiguity) combining
/// that sport's standings and events in one place.
class SportDetailScreen extends ConsumerStatefulWidget {
  const SportDetailScreen({super.key, required this.sport});

  final String sport;

  @override
  ConsumerState<SportDetailScreen> createState() => _SportDetailScreenState();
}

class _SportDetailScreenState extends ConsumerState<SportDetailScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
  String? _seasonId;
  bool _showTeams = false;

  // Built once and reused — a fresh Map literal on every build() would give
  // eventListProvider.family a new (reference-unequal) key each rebuild,
  // tearing down and restarting the in-flight request forever.
  late final Map<String, String?> _eventFilters = {'sport': widget.sport, 'status': null, 'seasonId': null};

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final seasonsAsync = ref.watch(seasonsListProvider);
    if (seasonsAsync.hasValue && _seasonId == null) {
      final seasons = seasonsAsync.requireValue;
      if (seasons.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || _seasonId != null) return;
          setState(() => _seasonId = defaultSeasonId(seasons));
        });
      }
    }

    final players = _seasonId != null
        ? ref.watch(leaderboardPlayersProvider((sport: widget.sport, seasonId: _seasonId!)))
        : null;
    final teams = _seasonId != null
        ? ref.watch(leaderboardTeamsProvider((sport: widget.sport, seasonId: _seasonId!)))
        : null;
    final eventsAsync = ref.watch(eventListProvider(_eventFilters));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(sportEmoji(widget.sport), style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 8),
            Text(sportLabel(widget.sport)),
          ],
        ),
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Standings'),
            Tab(text: 'Events'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _standingsTab(context, seasonsAsync, players, teams),
          _eventsTab(context, eventsAsync),
        ],
      ),
    );
  }

  Widget _standingsTab(
    BuildContext context,
    AsyncValue<List<Map<String, dynamic>>> seasonsAsync,
    AsyncValue<List<Map<String, dynamic>>>? players,
    AsyncValue<List<Map<String, dynamic>>>? teams,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: seasonsAsync.when(
            loading: () => const LinearProgressIndicator(minHeight: 2),
            error: (e, _) => Text(friendlyError(e)),
            data: (seasons) {
              if (seasons.isEmpty) return const SizedBox.shrink();
              final effectiveId = (_seasonId != null && seasons.any((s) => s['id'] == _seasonId))
                  ? _seasonId
                  : defaultSeasonId(seasons);
              return DropdownButtonFormField<String>(
                initialValue: effectiveId,
                decoration: const InputDecoration(labelText: 'Season'),
                items: seasons
                    .map((s) => DropdownMenuItem(value: s['id'] as String, child: Text(formatSeasonSelectLabel(s))))
                    .toList(),
                onChanged: (v) => setState(() => _seasonId = v),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _toggleChip(context, label: 'Players', selected: !_showTeams, onTap: () => setState(() => _showTeams = false)),
              const SizedBox(width: 8),
              _toggleChip(context, label: 'Teams', selected: _showTeams, onTap: () => setState(() => _showTeams = true)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _showTeams
              ? teams?.when(
                    loading: () => const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text(friendlyError(e))),
                    data: (rows) {
                      if (_seasonId == null) return const Center(child: Text('No seasons available yet.'));
                      if (rows.isEmpty) {
                        return Center(child: Text('No team standings yet.', style: TextStyle(color: LayoutTokens.mutedText(context))));
                      }
                      return ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: rows.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) {
                          final r = rows[i];
                          final team = r['team'] as Map<String, dynamic>?;
                          final name = team?['name'] as String? ?? 'Team';
                          final w = (r['wins'] as num?)?.toInt() ?? 0;
                          final l = (r['losses'] as num?)?.toInt() ?? 0;
                          final total = w + l;
                          final pct = total > 0 ? ((w / total) * 100).round() : 0;
                          return Material(
                            color: LayoutTokens.cardBackground(context),
                            borderRadius: BorderRadius.circular(12),
                            child: ListTile(
                              leading: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w700, color: LayoutTokens.mutedText(context))),
                              title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('$w W', style: TextStyle(color: LayoutTokens.success(context), fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 12),
                                  Text('$l L', style: const TextStyle(color: AppTheme.danger)),
                                  const SizedBox(width: 12),
                                  Text('$pct%', style: TextStyle(color: LayoutTokens.mutedText(context))),
                                ],
                              ),
                            ),
                          );
                        },
                      );
                    },
                  ) ??
                  const SizedBox()
              : players?.when(
                    loading: () => const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(child: Text(friendlyError(e))),
                    data: (rows) {
                      if (_seasonId == null) return const Center(child: Text('No seasons available yet.'));
                      if (rows.isEmpty) {
                        return Center(child: Text('No stats yet for this season.', style: TextStyle(color: LayoutTokens.mutedText(context))));
                      }
                      return SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: SingleChildScrollView(
                          child: DataTable(
                            headingRowColor: WidgetStateProperty.all(LayoutTokens.cardBackground(context)),
                            showCheckboxColumn: false,
                            columns: [
                              const DataColumn(label: Text('#')),
                              const DataColumn(label: Text('Athlete')),
                              ...playerStatCells(widget.sport, null, 0).map((c) => DataColumn(label: Text(c.label))),
                            ],
                            rows: rows.asMap().entries.map((entry) {
                              final i = entry.key;
                              final r = entry.value;
                              final athlete = r['athlete'] as Map<String, dynamic>?;
                              final prof = athlete?['profile'] as Map<String, dynamic>?;
                              final name = prof?['full_name'] as String? ?? '—';
                              final aid = athlete?['id'] as String?;
                              final stats = r['stats'] as Map<String, dynamic>?;
                              final gp = (r['games_played'] as num?)?.toInt() ?? 0;
                              final cells = playerStatCells(widget.sport, stats, gp);
                              return DataRow(
                                onSelectChanged: aid == null ? null : (_) => context.push('/athletes/$aid'),
                                cells: [
                                  DataCell(Text('${i + 1}', style: TextStyle(color: LayoutTokens.mutedText(context)))),
                                  DataCell(Text(name, style: const TextStyle(fontWeight: FontWeight.w600))),
                                  ...cells.map(
                                    (c) => DataCell(
                                      Text(c.value, style: TextStyle(fontWeight: c.emphasis ? FontWeight.w800 : FontWeight.normal)),
                                    ),
                                  ),
                                ],
                              );
                            }).toList(),
                          ),
                        ),
                      );
                    },
                  ) ??
                  const SizedBox(),
        ),
      ],
    );
  }

  Widget _eventsTab(BuildContext context, AsyncValue<List<Map<String, dynamic>>> eventsAsync) {
    return eventsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(friendlyError(e))),
      data: (events) {
        if (events.isEmpty) {
          return Center(child: Text('No ${sportLabel(widget.sport)} events yet.', style: TextStyle(color: LayoutTokens.mutedText(context))));
        }
        final sorted = events.toList()
          ..sort((a, b) => (b['created_at'] as String? ?? '').compareTo(a['created_at'] as String? ?? ''));
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: sorted.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (ctx, i) {
            final ev = sorted[i];
            return EventCard(event: ev, onTap: () => context.push('/events/${ev['id']}'));
          },
        );
      },
    );
  }

  Widget _toggleChip(BuildContext context, {required String label, required bool selected, required VoidCallback onTap}) {
    return ChoiceChip(
      label: Text(
        label,
        style: TextStyle(fontWeight: FontWeight.w600, color: selected ? Colors.white : LayoutTokens.primaryText(context)),
      ),
      selected: selected,
      selectedColor: AppTheme.accent,
      backgroundColor: LayoutTokens.chipBackground(context),
      checkmarkColor: Colors.white,
      side: BorderSide(color: LayoutTokens.borderSubtle(context)),
      onSelected: (_) => onTap(),
    );
  }
}
