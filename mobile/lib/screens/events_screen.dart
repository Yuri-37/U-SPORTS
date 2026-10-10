import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../widgets/double_back_exit.dart';
import '../providers/events_api_provider.dart';
import '../theme/layout_tokens.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';
import '../widgets/event_card.dart';
import '../widgets/ui/brand_page.dart';
import '../widgets/ui/hub_header_actions.dart';

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
  String _sportFilter = '';
  String _search = '';
  final TextEditingController _searchCtrl = TextEditingController();
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
    _searchCtrl.dispose();
    super.dispose();
  }

  /// Search box and sport chips. Upright they sit fixed above the list;
  /// sideways they scroll with it, because there is no height to spare.
  Widget _filters(BuildContext context) {
    final compact = isCompactHeight(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(16, compact ? 8 : 18, 16, 0),
          child: TextField(
            controller: _searchCtrl,
            decoration: const InputDecoration(
              hintText: 'Search name or description',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (v) => setState(() => _search = v),
          ),
        ),
        SizedBox(height: compact ? 6 : 12),
        SizedBox(
          height: 42,
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
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _sportChip(context, '', 'All sports'),
                for (final s in ['basketball', 'volleyball', 'table-tennis'])
                  _sportChip(context, s, sportLabel(s)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = isCompactHeight(context);
    Widget tabs({Widget? header}) => TabBarView(
          controller: _tab,
          children: [
            _EventsList(
              statuses: const ['registration', 'in_progress'],
              sportFilter: _sportFilter,
              search: _search,
              header: header,
            ),
            _EventsList(
              statuses: const ['completed', 'cancelled'],
              sportFilter: _sportFilter,
              search: _search,
              header: header,
            ),
          ],
        );

    return DoubleBackToExit(
      child: BrandPage.fixed(
        showBack: false,
        title: 'Events',
        actions: const [HubHeaderActions()],
        bottom: BrandTabBar(controller: _tab, tabs: const ['Upcoming & live', 'Past results']),
        body: compact
            ? tabs(header: _filters(context))
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _filters(context),
                  Expanded(child: tabs()),
                ],
              ),
      ),
    );
  }

  Widget _sportChip(BuildContext context, String sport, String label) {
    final selected = _sportFilter == sport;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? Theme.of(context).colorScheme.onPrimary : LayoutTokens.primaryText(context),
          ),
        ),
        selected: selected,
        onSelected: (_) => setState(() => _sportFilter = sport),
      ),
    );
  }
}

class _EventsList extends ConsumerWidget {
  const _EventsList({
    required this.statuses,
    required this.sportFilter,
    required this.search,
    this.header,
  });

  final List<String> statuses;
  final String sportFilter;
  final String search;

  /// Shown as the first scrolling row (the filters, when held sideways).
  final Widget? header;

  static const _allEvents = {'status': null, 'sport': null, 'seasonId': null};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allAsync = ref.watch(eventListProvider(_allEvents));

    // Pull-to-refresh works in every state, including an error: a failed load
    // used to leave this tab stuck on its message with no way to retry.
    Future<void> refresh() async => ref.invalidate(eventListProvider(_allEvents));

    Widget scrollableMessage(String text) => RefreshIndicator(
          onRefresh: refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [if (header != null) header!, SheetMessage(text: text)],
          ),
        );

    return allAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => scrollableMessage(friendlyError(e)),
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
        if (list.isEmpty) return scrollableMessage('No events found.');
        return RefreshIndicator(
          onRefresh: refresh,
          child: ListView.separated(
            // With a header the rows carry their own side padding, so the
            // header (which has its own) is not indented twice.
            padding: header != null ? const EdgeInsets.only(bottom: 24) : const EdgeInsets.fromLTRB(16, 16, 16, 24),
            physics: const AlwaysScrollableScrollPhysics(),
            itemCount: list.length + (header != null ? 1 : 0),
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (ctx, i) {
              if (header != null) {
                if (i == 0) return header!;
                i -= 1;
              }
              final ev = list[i];
              final card = EventCard(
                event: ev,
                onTap: () => context.push('/events/${ev['id']}'),
              );
              return header != null
                  ? Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: card)
                  : card;
            },
          ),
        );
      },
    );
  }
}
