import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import '../../utils/event_placements.dart';
import '../../utils/sport_helpers.dart';
import '../../utils/error_helpers.dart';

class AthleteOwnProfileScreen extends ConsumerStatefulWidget {
  const AthleteOwnProfileScreen({super.key});

  @override
  ConsumerState<AthleteOwnProfileScreen> createState() => _AthleteOwnProfileScreenState();
}

class _AthleteOwnProfileScreenState extends ConsumerState<AthleteOwnProfileScreen> {
  String? _loadedAthleteId;
  Future<Map<String, dynamic>>? _extrasFuture;

  // Memoized by athleteId — `build()` re-runs whenever any watched provider
  // changes (e.g. an unrelated screen invalidating `profileProvider`), so
  // calling `_loadExtras` directly in a `FutureBuilder.future` would refetch
  // (several sequential queries, including a per-event bracket lookup) on
  // every rebuild instead of once per athlete.
  Future<Map<String, dynamic>> _extrasFor(String athleteId) {
    if (_loadedAthleteId != athleteId) {
      _loadedAthleteId = athleteId;
      _extrasFuture = _loadExtras(athleteId);
    }
    return _extrasFuture!;
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(profileProvider);
    final athleteAsync = ref.watch(athleteRowProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('My profile'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/athlete/dashboard');
            }
          },
        ),
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(friendlyError(e))),
        data: (profile) {
          return athleteAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(friendlyError(e))),
            data: (athlete) {
              if (profile == null || athlete == null) {
                return const Center(child: Text('Unable to load athlete record.'));
              }

              final initial = (profile.fullName?.trim().isNotEmpty ?? false) ? profile.fullName!.trim()[0].toUpperCase() : '?';

              return FutureBuilder<Map<String, dynamic>>(
                future: _extrasFor(athlete.id),
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting && !snap.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snap.hasError) {
                    return Center(
                      child: Text(
                        'Could not load your team/finishes.',
                        style: TextStyle(color: LayoutTokens.mutedText(context)),
                      ),
                    );
                  }
                  final teams = snap.data?['teams'] as List<dynamic>? ?? [];
                  final finishes = snap.data?['finishes'] as List<dynamic>? ?? [];

                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: AppTheme.schoolPrimary,
                            backgroundImage: profile.avatarUrl != null && profile.avatarUrl!.isNotEmpty
                                ? CachedNetworkImageProvider(profile.avatarUrl!)
                                : null,
                            child: profile.avatarUrl == null || profile.avatarUrl!.isEmpty
                                ? Text(
                                    initial,
                                    style: TextStyle(
                                        fontSize: 32, color: AppTheme.schoolSecondary, fontWeight: FontWeight.w900),
                                  )
                                : null,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(profile.fullName ?? 'Athlete',
                                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                                Text('${sportEmoji(athlete.sport)} ${sportLabel(athlete.sport)}',
                                    style: TextStyle(color: LayoutTokens.secondaryText(context))),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Text('Teams', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 6),
                      if (teams.isEmpty)
                        Text('No team assignments yet.', style: TextStyle(color: LayoutTokens.mutedText(context)))
                      else
                        ...teams.map((t) => ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text((t as Map)['name'] as String? ?? 'Team'),
                              subtitle: Text((t)['sport'] as String? ?? ''),
                            )),
                      const SizedBox(height: 16),
                      const Text('Competition finishes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      if (finishes.isEmpty)
                        Text('No completed finishes on record.', style: TextStyle(color: LayoutTokens.mutedText(context)))
                      else
                        ...finishes.map((f) {
                          final m = f as Map<String, dynamic>;
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(m['eventName'] as String? ?? ''),
                            subtitle: Text('${placementRankLabel(m['rank'] as int)} · ${sportLabel(m['sport'] as String? ?? '')}'),
                            onTap: () => context.push('/events/${m['eventId']}'),
                          );
                        }),
                    ],
                  );
                },
              );
            },
          );
        },
      ),
    );
  }

  Future<Map<String, dynamic>> _loadExtras(String athleteId) async {
    final tm = await Supabase.instance.client.from('team_members').select('team_id').eq('athlete_id', athleteId);
    final teamIds = [...(tm as List).map((e) => (e as Map)['team_id'] as String)];
    List<Map<String, dynamic>> teams = [];
    if (teamIds.isNotEmpty) {
      final tr = await Supabase.instance.client.from('teams').select('id,name,sport').inFilter('id', teamIds);
      teams = (tr as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }

    final finishes = <Map<String, dynamic>>[];
    if (teamIds.isNotEmpty) {
      final eps = await Supabase.instance.client.from('event_participants').select('event_id, participant_id').inFilter('participant_id', teamIds);
      final evIds = <dynamic>{...(eps as List).map((e) => (e as Map)['event_id'] as String)}.toList();
      if (evIds.isNotEmpty) {
        final evs = await Supabase.instance.client
            .from('events')
            .select('id,name,sport')
            .inFilter('id', evIds)
            .eq('status', 'completed');
        for (final ev in evs as List) {
          final m = Map<String, dynamic>.from(ev as Map);
          final eid = m['id'] as String;
          final myParts = (eps as List)
              .where((e) => (e as Map)['event_id'] == eid)
              .map((e) => (e as Map)['participant_id'] as String)
              .toSet();
          final br = await Supabase.instance.client
              .from('brackets')
              .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
              .eq('event_id', eid);
          final podium = deriveEliminationPodium((br as List).map((x) => Map<String, dynamic>.from(x as Map)).toList());
          if (podium == null) continue;
          final mine = podium.where((p) => myParts.contains(p.participantId)).toList();
          if (mine.isEmpty) continue;
          finishes.add({
            'eventId': eid,
            'eventName': m['name'],
            'sport': m['sport'],
            'rank': mine.first.rank,
          });
        }
      }
    }

    return {
      'teams': teams,
      'finishes': finishes,
    };
  }
}
