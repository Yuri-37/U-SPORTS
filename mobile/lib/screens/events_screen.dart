import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../widgets/double_back_exit.dart';
import '../providers/events_api_provider.dart';
import '../providers/notifications_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';
import '../widgets/event_card.dart';
import '../widgets/notification_bell_icon_button.dart';

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
  String _sportFilter = '';
  String _search = '';
  bool _appliedPastQuery = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_appliedPastQuery) return;
    final q = GoRouterState.of(context).uri.queryParameters;
    if (q['tab'] == 'past' || q['view'] == 'past') {
      _appliedPastQuery = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _tab.index != 1) _tab.animateTo(1);
      });
    }
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(profileProvider);
    final profile = profileAsync.valueOrNull;
    final role = profile?.role ?? 'guest';

    return DoubleBackToExit(
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Events'),
        actions: [
          if (role == 'guest')
            IconButton(
              icon: const Icon(Icons.settings_outlined),
              onPressed: () => context.push('/settings'),
            ),
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
            IconButton(
              icon: const Icon(Icons.settings_outlined),
              onPressed: () => context.push('/athlete/settings'),
            ),
        ],
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Upcoming & live'),
            Tab(text: 'Past'),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search name or description',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ShaderMask(
              shaderCallback: (rect) => const LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [Colors.black, Colors.black, Colors.transparent],
                stops: [0.0, 0.9, 1.0],
              ).createShader(rect),
              blendMode: BlendMode.dstIn,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(
                        'All sports',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: _sportFilter.isEmpty ? Colors.white : LayoutTokens.primaryText(context),
                        ),
                      ),
                      selected: _sportFilter.isEmpty,
                      selectedColor: AppTheme.accent,
                      backgroundColor: LayoutTokens.chipBackground(context),
                      checkmarkColor: Colors.white,
                      side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                      onSelected: (_) => setState(() => _sportFilter = ''),
                    ),
                  ),
                  for (final s in ['basketball', 'volleyball', 'table-tennis'])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          '${sportEmoji(s)} ${sportLabel(s)}',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: _sportFilter == s ? Colors.white : LayoutTokens.primaryText(context),
                          ),
                        ),
                        selected: _sportFilter == s,
                        selectedColor: AppTheme.accent,
                        backgroundColor: LayoutTokens.chipBackground(context),
                        checkmarkColor: Colors.white,
                        side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                        onSelected: (_) => setState(() => _sportFilter = s),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                _EventsList(
                  statuses: const ['registration', 'in_progress'],
                  sportFilter: _sportFilter,
                  search: _search,
                ),
                _EventsList(
                  statuses: const ['completed', 'cancelled'],
                  sportFilter: _sportFilter,
                  search: _search,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    );
  }
}

class _EventsList extends ConsumerWidget {
  const _EventsList({required this.statuses, required this.sportFilter, required this.search});

  final List<String> statuses;
  final String sportFilter;
  final String search;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allAsync = ref.watch(eventListProvider(const {
      'status': null,
      'sport': null,
      'seasonId': null,
    }));

    return allAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(friendlyError(e))),
      data: (all) {
        var list = all.where((ev) => statuses.contains(ev['status'] as String? ?? '')).toList();
        if (sportFilter.isNotEmpty) {
          list = list.where((ev) => ev['sport'] == sportFilter).toList();
        }
        final q = search.trim().toLowerCase();
        if (q.isNotEmpty) {
          list = list.where((ev) {
            final name = (ev['name'] as String? ?? '').toLowerCase();
            final desc = (ev['description'] as String? ?? '').toLowerCase();
            return name.contains(q) || desc.contains(q);
          }).toList();
        }
        list.sort((a, b) {
          final ca = a['created_at'] as String? ?? '';
          final cb = b['created_at'] as String? ?? '';
          return cb.compareTo(ca);
        });
        if (list.isEmpty) {
          return Center(child: Text('No events found.', style: TextStyle(color: LayoutTokens.mutedText(context))));
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (ctx, i) {
            final ev = list[i];
            return EventCard(
              event: ev,
              onTap: () => context.push('/events/${ev['id']}'),
            );
          },
        );
      },
    );
  }
}
