import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../providers/leaderboard_provider.dart';
import '../providers/notifications_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../widgets/double_back_exit.dart';
import '../widgets/notification_bell_icon_button.dart';
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
  bool _qpSportApplied = false;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
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

    final profileAsync = ref.watch(profileProvider);
    final profile = profileAsync.valueOrNull;
    final role = profile?.role ?? 'guest';

    final players = _seasonId != null
        ? ref.watch(leaderboardPlayersProvider((sport: _sport, seasonId: _seasonId!)))
        : null;
    final teams = _seasonId != null
        ? ref.watch(leaderboardTeamsProvider((sport: _sport, seasonId: _seasonId!)))
        : null;

    return DoubleBackToExit(
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Standings & Leaderboards'),
        actions: [
          if (role == 'guest')
            IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/settings')),
          if (role == 'athlete')
            profile != null && profile.isAthlete
                ? NotificationBellIconButton(
                    badgeCount: ref.watch(athleteNotificationBadgeCountProvider),
                    onPressed: () => context.push('/notifications'),
                  )
                : IconButton(
                    icon: const Icon(Icons.notifications_outlined),
                    onPressed: () => context.push('/notifications'),
                  ),
          if (role == 'athlete')
            IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/athlete/settings')),
        ],
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Player stats'),
            Tab(text: 'Team standings'),
          ],
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text('Season statistics and rankings', style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(context))),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: ['basketball', 'volleyball', 'table-tennis']
                    .map(
                      (s) {
                        final selected = _sport == s;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(
                              sportLabel(s),
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: selected ? Colors.white : LayoutTokens.primaryText(context),
                              ),
                            ),
                            selected: selected,
                            selectedColor: AppTheme.accent,
                            backgroundColor: LayoutTokens.chipBackground(context),
                            checkmarkColor: Colors.white,
                            side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                            onSelected: (_) => setState(() => _sport = s),
                          ),
                        );
                      },
                    )
                    .toList(),
              ),
            ),
          ),
          Padding(
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
                return Column(
                  children: [
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Find season',
                        hintText: 'Filter season list…',
                        prefixIcon: Icon(Icons.search, size: 20),
                        isDense: true,
                      ),
                      onChanged: (v) => setState(() => _seasonListQuery = v),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: effectiveId,
                      decoration: const InputDecoration(labelText: 'Season'),
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
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: TextField(
                        decoration: const InputDecoration(
                          labelText: 'Search athletes',
                          hintText: 'Filter by name…',
                          prefixIcon: Icon(Icons.search, size: 20),
                          isDense: true,
                        ),
                        onChanged: (v) => setState(() => _athleteSearch = v),
                      ),
                    ),
                    Expanded(
                      child: players?.when(
                            loading: () => const Center(child: CircularProgressIndicator()),
                            error: (e, _) => Center(child: Text(friendlyError(e))),
                            data: (rows) {
                              if (_seasonId == null) {
                                return const Center(child: Text('No seasons available yet.'));
                              }
                              final q = _athleteSearch.trim().toLowerCase();
                              final filtered = q.isEmpty
                                  ? rows
                                  : rows.where((r) {
                                      final athlete = r['athlete'] as Map<String, dynamic>?;
                                      final prof = athlete?['profile'] as Map<String, dynamic>?;
                                      final name = (prof?['full_name'] as String? ?? '').toLowerCase();
                                      return name.contains(q);
                                    }).toList();
                              if (filtered.isEmpty) {
                                return Center(
                                  child: Text(
                                    q.isNotEmpty ? 'No athletes match your search.' : 'No stats yet for this season.',
                                    style: TextStyle(color: LayoutTokens.mutedText(context)),
                                  ),
                                );
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
                                      ...playerStatCells(_sport, null, 0).map((c) => DataColumn(label: Text(c.label))),
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
                                          DataCell(Text(name, style: const TextStyle(fontWeight: FontWeight.w600))),
                                          ...cells.map(
                                            (c) => DataCell(
                                              Text(
                                                c.value,
                                                style: TextStyle(fontWeight: c.emphasis ? FontWeight.w800 : FontWeight.normal),
                                              ),
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
                ),
                teams?.when(
                      loading: () => const Center(child: CircularProgressIndicator()),
                      error: (e, _) => Center(child: Text(friendlyError(e))),
                      data: (rows) {
                        if (_seasonId == null) {
                          return const Center(child: Text('No seasons available yet.'));
                        }
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
                            final teamId = team?['id'] as String?;
                            final name = team?['name'] as String? ?? 'Team';
                            final w = (r['wins'] as num?)?.toInt() ?? 0;
                            final l = (r['losses'] as num?)?.toInt() ?? 0;
                            final total = w + l;
                            final pct = total > 0 ? ((w / total) * 100).round() : 0;
                            return Material(
                              color: LayoutTokens.cardBackground(context),
                              borderRadius: BorderRadius.circular(12),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(12),
                                onTap: teamId == null ? null : () => context.push('/teams/$teamId'),
                                child: ListTile(
                                  leading: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w700, color: LayoutTokens.mutedText(context))),
                                  title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                  subtitle: Text(sportLabel(_sport)),
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
                              ),
                            );
                          },
                        );
                      },
                    ) ??
                    const SizedBox(),
              ],
            ),
          ),
        ],
      ),
    ),
    );
  }
}
