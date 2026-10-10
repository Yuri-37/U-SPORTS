import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/leaderboard_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../widgets/double_back_exit.dart';
import '../widgets/ui/brand_page.dart';
import '../widgets/ui/hub_header_actions.dart';
import '../utils/leaderboard_stats.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';

class LeaderboardScreen extends ConsumerStatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  ConsumerState<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends ConsumerState<LeaderboardScreen> with SingleTickerProviderStateMixin {
  late TabController _tab;
  String _sport = 'basketball';
  String? _seasonId;
  String _seasonListQuery = '';
  String _athleteSearch = '';
  final TextEditingController _athleteSearchCtrl = TextEditingController();
  final TextEditingController _seasonQueryCtrl = TextEditingController();
  bool _qpSportApplied = false;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    _athleteSearchCtrl.dispose();
    _seasonQueryCtrl.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _filteredSeasons(List<Map<String, dynamic>> seasons) {
    final q = _seasonListQuery.trim().toLowerCase();
    if (q.isEmpty) return seasons;
    return seasons.where((s) => (s['name'] as String? ?? '').toLowerCase().contains(q)).toList();
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

    if (!_qpSportApplied) {
      final qpSport = GoRouterState.of(context).uri.queryParameters['sport'];
      if (qpSport != null && qpSport.isNotEmpty && qpSport != _sport) {
        _qpSportApplied = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _sport = qpSport);
        });
      } else {
        _qpSportApplied = true;
      }
    }

    final players = _seasonId != null
        ? ref.watch(leaderboardPlayersProvider((sport: _sport, seasonId: _seasonId!)))
        : null;
    final teams = _seasonId != null
        ? ref.watch(leaderboardTeamsProvider((sport: _sport, seasonId: _seasonId!)))
        : null;

    // Held sideways there is no height for fixed filters above the lists, so
    // they become the first rows of each tab and scroll away with it.
    final compact = isCompactHeight(context);
    Widget pane(Widget? header, Widget child) => header == null
        ? child
        : ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [header, child],
          );

    final Widget chips = Padding(
              padding: EdgeInsets.fromLTRB(16, compact ? 8 : 20, 16, 0),
              child: SizedBox(
                height: 46,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: ['basketball', 'volleyball', 'table-tennis'].map((s) {
                    final selected = _sport == s;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          sportLabel(s),
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: selected
                                ? Theme.of(context).colorScheme.onPrimary
                                : LayoutTokens.primaryText(context),
                          ),
                        ),
                        selected: selected,
                        onSelected: (_) => setState(() => _sport = s),
                      ),
                    );
                  }).toList(),
                ),
              ),
            );
    final Widget seasonRow = Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: seasonsAsync.when(
                loading: () => const LinearProgressIndicator(minHeight: 2),
                error: (e, _) => Text(friendlyError(e)),
                data: (seasons) {
                  final filtered = _filteredSeasons(seasons);
                  final effectiveId = _seasonId != null && seasons.any((s) => s['id'] == _seasonId)
                      ? _seasonId
                      : (seasons.isNotEmpty ? defaultSeasonId(seasons) : null);
                  var options = filtered;
                  if (effectiveId != null && !options.any((s) => s['id'] == effectiveId)) {
                    Map<String, dynamic>? sel;
                    for (final s in seasons) {
                      if (s['id'] == effectiveId) {
                        sel = s;
                        break;
                      }
                    }
                    if (sel != null) options = [sel, ...options];
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _seasonQueryCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Find season',
                            hintText: 'Filter…',
                            isDense: true,
                          ),
                          onChanged: (v) => setState(() => _seasonListQuery = v),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: effectiveId,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Season', isDense: true),
                          borderRadius: BorderRadius.circular(16),
                          selectedItemBuilder: (context) => options
                              .map(
                                (s) => Text(
                                  formatSeasonSelectLabel(s),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              )
                              .toList(),
                          items: options
                              .map(
                                (s) => DropdownMenuItem(
                                  value: s['id'] as String,
                                  child: Text(formatSeasonSelectLabel(s)),
                                ),
                              )
                              .toList(),
                          onChanged: seasons.isEmpty ? null : (v) => setState(() => _seasonId = v),
                        ),
                      ),
                    ],
                  );
                },
              ),
            );
    final Widget searchField = Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: TextField(
                          controller: _athleteSearchCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Search athletes',
                            hintText: 'Filter by name…',
                            prefixIcon: Icon(Icons.search, size: 20),
                            isDense: true,
                          ),
                          onChanged: (v) => setState(() => _athleteSearch = v),
                        ),
                      );

    final Widget? playersHeader = compact
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [chips, seasonRow, const SizedBox(height: 12), searchField],
          )
        : null;
    final Widget? teamsHeader = compact
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [chips, seasonRow, const SizedBox(height: 12)],
          )
        : null;

    final Widget playersPane = players?.when(
                              loading: () => pane(playersHeader, const Center(child: CircularProgressIndicator())),
                              error: (e, _) => pane(playersHeader, SheetMessage(text: friendlyError(e))),
                              data: (rows) {
                                if (_seasonId == null) {
                                  return pane(playersHeader, const SheetMessage(text: 'No seasons available yet.'));
                                }
                                final q = _athleteSearch.trim().toLowerCase();
                                final matching = q.isEmpty
                                    ? rows
                                    : rows.where((r) {
                                        final athlete = r['athlete'] as Map<String, dynamic>?;
                                        final prof = athlete?['profile'] as Map<String, dynamic>?;
                                        final name = (prof?['full_name'] as String? ?? '').toLowerCase();
                                        return name.contains(q);
                                      }).toList();
                                final filtered = sortByRank(matching, _sport);
                                if (filtered.isEmpty) {
                                  return pane(
                                    playersHeader,
                                    SheetMessage(
                                      text: q.isNotEmpty ? 'No athletes match your search.' : 'No stats yet for this season.',
                                    ),
                                  );
                                }
                                return RefreshIndicator(onRefresh: _refresh, child: SingleChildScrollView(
physics: const AlwaysScrollableScrollPhysics(),
                                  padding: EdgeInsets.zero,
                                  child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (playersHeader != null) playersHeader,
                  Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), child: SheetGroup(
                                    dividers: false,
                                    children: [
                                      SingleChildScrollView(
                                        scrollDirection: Axis.horizontal,
                                        child: DataTable(
                                          headingTextStyle: AppTheme.overline(LayoutTokens.mutedText(context)),
                                          dataTextStyle: TextStyle(
                                            fontSize: 14,
                                            color: LayoutTokens.primaryText(context),
                                          ),
                                          dividerThickness: 0.6,
                                          horizontalMargin: 16,
                                          columnSpacing: 22,
                                          showCheckboxColumn: false,
                                          columns: [
                                            const DataColumn(label: Text('#')),
                                            const DataColumn(label: Text('ATHLETE')),
                                            ...playerStatCells(_sport, null, 0)
                                                .map((c) => DataColumn(label: Text(c.label.toUpperCase()))),
                                          ],
                                          rows: filtered.asMap().entries.map((entry) {
                                            final i = entry.key;
                                            final r = entry.value;
                                            final athlete = r['athlete'] as Map<String, dynamic>?;
                                            final prof = athlete?['profile'] as Map<String, dynamic>?;
                                            final name = prof?['full_name'] as String? ?? '—';
                                            final aid = athlete?['id'] as String?;
                                            final stats = r['stats'] as Map<String, dynamic>?;
                                            final gp = (r['games_played'] as num?)?.toInt() ?? 0;
                                            final cells = playerStatCells(_sport, stats, gp);
                                            return DataRow(
                                              onSelectChanged: aid == null ? null : (_) => context.push('/athletes/$aid'),
                                              cells: [
                                                DataCell(Text('${i + 1}', style: TextStyle(color: LayoutTokens.mutedText(context)))),
                                                DataCell(Text(name, style: const TextStyle(fontWeight: FontWeight.w700))),
                                                ...cells.map(
                                                  (c) => DataCell(
                                                    Text(
                                                      c.value,
                                                      style: TextStyle(
                                                        fontWeight: c.emphasis ? FontWeight.w800 : FontWeight.w500,
                                                        color: c.emphasis ? AppTheme.brandInk(context) : null,
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            );
                                          }).toList(),
                                        ),
                                      ),
                                    ],
                                  )),
                ],
              ),
                                ));
                              },
                            ) ??
        pane(playersHeader, const SizedBox());
    final Widget teamsPane = teams?.when(
                        loading: () => pane(teamsHeader, const Center(child: CircularProgressIndicator())),
                        error: (e, _) => pane(teamsHeader, SheetMessage(text: friendlyError(e))),
                        data: (rows) {
                          if (_seasonId == null) {
                            return pane(teamsHeader, const SheetMessage(text: 'No seasons available yet.'));
                          }
                          if (rows.isEmpty) {
                            return pane(teamsHeader, const SheetMessage(text: 'No team rankings yet.'));
                          }
                          final standings = sortTeamStandings(rows);
                          return RefreshIndicator(onRefresh: _refresh, child: SingleChildScrollView(
physics: const AlwaysScrollableScrollPhysics(),
                            padding: EdgeInsets.zero,
                            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (teamsHeader != null) teamsHeader,
                  Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), child: SheetGroup(
                              children: [
                                for (var i = 0; i < standings.length; i++)
                                  _teamRow(context, i, standings[i]),
                              ],
                            )),
                ],
              ),
                          ));
                        },
                      ) ??
        pane(teamsHeader, const SizedBox());

    return DoubleBackToExit(
      child: BrandPage.fixed(
        showBack: false,
        title: 'Rankings & Leaderboards',
        subtitle: 'Season statistics and rankings',
        actions: const [HubHeaderActions()],
        bottom: BrandTabBar(controller: _tab, tabs: const ['Player stats', 'Team rankings']),
        body: compact
            ? TabBarView(controller: _tab, children: [playersPane, teamsPane])
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  chips,
                  seasonRow,
                  const SizedBox(height: 12),
                  Expanded(
                    child: TabBarView(
                      controller: _tab,
                      children: [
                        Column(
                          children: [
                            searchField,
                            Expanded(child: playersPane),
                          ],
                        ),
                        teamsPane,
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  /// Pull-to-refresh: reload this sport/season's player and team rankings.
  Future<void> _refresh() async {
    final id = _seasonId;
    if (id == null) return;
    final playersKey = (sport: _sport, seasonId: id);
    ref.invalidate(leaderboardPlayersProvider(playersKey));
    ref.invalidate(leaderboardTeamsProvider(playersKey));
    try {
      await Future.wait([
        ref.read(leaderboardPlayersProvider(playersKey).future),
        ref.read(leaderboardTeamsProvider(playersKey).future),
      ]);
    } catch (_) {
      // The lists show their own error state.
    }
  }

  Widget _teamRow(BuildContext context, int i, Map<String, dynamic> r) {
    final team = r['team'] as Map<String, dynamic>?;
    final teamId = team?['id'] as String?;
    final name = team?['name'] as String? ?? 'Team';
    final w = (r['wins'] as num?)?.toInt() ?? 0;
    final l = (r['losses'] as num?)?.toInt() ?? 0;
    final total = w + l;
    final pct = total > 0 ? ((w / total) * 100).round() : 0;
    return SheetTile(
      leading: RankBadge(rank: i + 1),
      title: name,
      subtitle: sportLabel(_sport),
      onTap: teamId == null ? null : () => context.push('/teams/$teamId'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$w W', style: TextStyle(color: LayoutTokens.success(context), fontWeight: FontWeight.w800)),
          const SizedBox(width: 10),
          Text('$l L', style: TextStyle(color: LayoutTokens.danger(context), fontWeight: FontWeight.w700)),
          const SizedBox(width: 10),
          Text('$pct%', style: TextStyle(color: LayoutTokens.mutedText(context), fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
