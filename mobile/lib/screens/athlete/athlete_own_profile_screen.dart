import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/event_placements.dart';
import '../../utils/sport_helpers.dart';
import '../../utils/error_helpers.dart';
import '../../widgets/avatar_upload_button.dart';
import '../../widgets/ui/brand_page.dart';

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

    Widget page(Widget body) => BrandPage.fixed(
          title: 'My profile',
          onBack: () => context.canPop() ? context.pop() : context.go('/athlete/dashboard'),
          body: body,
        );

    return profileAsync.when(
      loading: () => page(const Center(child: CircularProgressIndicator())),
      error: (e, _) => page(SheetMessage(text: friendlyError(e))),
      data: (profile) {
        return athleteAsync.when(
          loading: () => page(const Center(child: CircularProgressIndicator())),
          error: (e, _) => page(SheetMessage(text: friendlyError(e))),
          data: (athlete) {
            if (profile == null || athlete == null) {
              return page(const SheetMessage(text: 'Unable to load athlete record.'));
            }

            final initial = (profile.fullName?.trim().isNotEmpty ?? false) ? profile.fullName!.trim()[0].toUpperCase() : '?';

            return FutureBuilder<Map<String, dynamic>>(
              future: _extrasFor(athlete.id),
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting && !snap.hasData) {
                  return const BrandPage.fixed(title: 'My profile', body: Center(child: CircularProgressIndicator()));
                }
                if (snap.hasError) {
                  return page(const SheetMessage(text: 'Could not load your team/finishes.'));
                }
                final teams = snap.data?['teams'] as List<dynamic>? ?? [];
                final finishes = snap.data?['finishes'] as List<dynamic>? ?? [];

                return BrandPage.scroll(
                  title: 'My profile',
                  onBack: () => context.canPop() ? context.pop() : context.go('/athlete/dashboard'),
                  hero: Column(
                    children: [
                      AvatarUploadButton(avatarUrl: profile.avatarUrl, fallbackInitial: initial, radius: 40),
                      const SizedBox(height: 14),
                      Text(profile.fullName ?? 'Athlete',
                          textAlign: TextAlign.center, style: AppTheme.display(size: 21, color: Colors.white)),
                      const SizedBox(height: 4),
                      Text(
                        '${sportEmoji(athlete.sport)}  ${sportLabel(athlete.sport)}',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.78), fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  children: [
                    const SectionHeader(title: 'Teams'),
                    if (teams.isEmpty)
                      const SheetMessage(icon: Icons.groups_outlined, text: 'No team assignments yet.')
                    else
                      SheetGroup(
                        children: teams.map((t) {
                          final m = t as Map;
                          final tSport = m['sport'] as String? ?? '';
                          return SheetTile(
                            leading: IconTile(emoji: sportEmoji(tSport), color: sportTint(context, tSport)),
                            title: m['name'] as String? ?? 'Team',
                            subtitle: sportLabel(tSport),
                          );
                        }).toList(),
                      ),
                    const SectionHeader(title: 'Competition finishes'),
                    if (finishes.isEmpty)
                      const SheetMessage(icon: Icons.emoji_events_outlined, text: 'No completed finishes on record.')
                    else
                      SheetGroup(
                        children: finishes.map((f) {
                          final m = f as Map<String, dynamic>;
                          return SheetTile(
                            leading: IconTile(icon: Icons.emoji_events_outlined, color: sportTint(context, m['sport'] as String?)),
                            title: m['eventName'] as String? ?? '',
                            subtitle: '${placementRankLabel(m['rank'] as int)} · ${sportLabel(m['sport'] as String? ?? '')}',
                            onTap: () => context.push('/events/${m['eventId']}'),
                          );
                        }).toList(),
                      ),
                  ],
                );
              },
            );
          },
        );
      },
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
