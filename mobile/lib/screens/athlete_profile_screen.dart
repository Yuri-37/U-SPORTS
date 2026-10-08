import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/layout_tokens.dart';
import '../utils/sport_helpers.dart';
import '../utils/error_helpers.dart';
import '../widgets/stat_chip.dart';
import '../widgets/ui/brand_page.dart';

final _athletePublicProvider = FutureProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, athleteId) async {
  // Post-migration 040: verification/medical clearance removed. Athletes are visible
  // when season_status = 'active' (RLS enforces this too).
  final a = await Supabase.instance.client
      .from('athletes')
      .select('*, profile:profiles!athletes_profile_id_fkey(full_name, avatar_url)')
      .eq('id', athleteId)
      .maybeSingle();
  if (a == null) return null;
  return Map<String, dynamic>.from(a as Map);
});

final _athleteStatsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>?, String>((ref, athleteId) async {
  final s = await Supabase.instance.client
      .from('player_season_stats')
      .select()
      .eq('athlete_id', athleteId)
      .order('updated_at', ascending: false)
      .limit(1)
      .maybeSingle();
  if (s == null) return null;
  return Map<String, dynamic>.from(s as Map);
});

final _athleteInsightsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, athleteId) async {
  final rows = await Supabase.instance.client
      .from('insights')
      .select()
      .eq('entity_type', 'player')
      .eq('entity_id', athleteId)
      .limit(3);
  return (rows as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
});

/// Team name + sport only (no coach names) — teams/team_members RLS is fully
/// public, matches the two-step query already used on the athlete's own
/// profile (athlete_own_profile_screen.dart's _loadExtras).
final _athleteTeamsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, athleteId) async {
  final tm = await Supabase.instance.client.from('team_members').select('team_id').eq('athlete_id', athleteId);
  final teamIds = (tm as List).map((e) => (e as Map)['team_id'] as String).toList();
  if (teamIds.isEmpty) return [];
  final teams = await Supabase.instance.client.from('teams').select('id,name,sport').inFilter('id', teamIds);
  return (teams as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
});

class AthleteProfileScreen extends ConsumerWidget {
  const AthleteProfileScreen({super.key, required this.athleteId});

  final String athleteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteAsync = ref.watch(_athletePublicProvider(athleteId));
    final statsAsync = ref.watch(_athleteStatsProvider(athleteId));
    final insAsync = ref.watch(_athleteInsightsProvider(athleteId));
    final teamsAsync = ref.watch(_athleteTeamsProvider(athleteId));

    return athleteAsync.when(
      loading: () => const BrandPage.fixed(title: 'Athlete', body: Center(child: CircularProgressIndicator())),
      error: (e, _) => BrandPage.fixed(title: 'Athlete', body: SheetMessage(text: friendlyError(e))),
      data: (athlete) {
        if (athlete == null) {
          return const BrandPage.fixed(title: 'Athlete', body: SheetMessage(text: 'Athlete not found or not public.'));
        }
        final prof = athlete['profile'] as Map<String, dynamic>?;
        final name = prof?['full_name'] as String? ?? 'Athlete';
        final avatar = prof?['avatar_url'] as String?;
        final sport = athlete['sport'] as String? ?? '';
        final position = (athlete['position'] as String?)?.trim();
        final yearLevel = (athlete['year_level'] as String?)?.trim();
        final jersey = athlete['jersey_number'];
        final stats = statsAsync.valueOrNull;
        final gp = (stats?['games_played'] as num?)?.toInt() ?? 0;
        final rawStats = stats?['stats'] as Map<String, dynamic>?;
        final highlights = seasonStatHighlights(sport, rawStats, gp);
        final insights = insAsync.valueOrNull ?? [];
        final teams = teamsAsync.valueOrNull ?? [];

        return BrandPage.scroll(
          onRefresh: () async {
            ref.invalidate(_athleteStatsProvider(athleteId));
            ref.invalidate(_athleteInsightsProvider(athleteId));
            ref.invalidate(_athleteTeamsProvider(athleteId));
            ref.invalidate(_athletePublicProvider(athleteId));
            try {
              await ref.read(_athletePublicProvider(athleteId).future);
            } catch (_) {}
          },
          title: name,
          subtitle: sportLabel(sport),
          hero: Column(
            children: [
              HeroAvatar(imageUrl: avatar, name: name, radius: 40),
              if ([position, jersey?.toString(), yearLevel].any((v) => v != null && v.toString().isNotEmpty)) ...[
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    if (position != null && position.isNotEmpty) _heroTag(position),
                    if (jersey != null) _heroTag('#$jersey'),
                    if (yearLevel != null && yearLevel.isNotEmpty) _heroTag(yearLevel),
                  ],
                ),
              ],
            ],
          ),
          children: [
            if (stats != null) ...[
              const SectionHeader(title: 'Season stats'),
              SheetGroup(
                padding: const EdgeInsets.all(16),
                children: [
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    alignment: WrapAlignment.center,
                    children: [
                      StatChip(label: 'GP', value: '$gp'),
                      for (var i = 0; i < highlights.length; i++)
                        StatChip(label: highlights[i].label, value: highlights[i].value, emphasis: i == 0),
                    ],
                  ),
                ],
              ),
            ],
            if (teams.isNotEmpty) ...[
              const SectionHeader(title: 'Team'),
              SheetGroup(
                // Tappable through to the team page, matching the web athlete
                // profile where the team entry is a link.
                children: teams.map((t) {
                  final tSport = t['sport'] as String? ?? '';
                  final tId = t['id'] as String?;
                  return SheetTile(
                    leading: IconTile(icon: sportIcon(tSport), color: sportTint(context, tSport)),
                    title: t['name'] as String? ?? '',
                    subtitle: sportLabel(tSport),
                    trailing: tId == null ? null : Icon(Icons.chevron_right_rounded, color: LayoutTokens.mutedText(context)),
                    onTap: tId == null ? null : () => context.push('/teams/$tId'),
                  );
                }).toList(),
              ),
            ],
            if (insights.isNotEmpty) ...[
              const SectionHeader(title: 'Insights'),
              SheetGroup(
                children: [
                  for (final i in insights)
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        i['insight_text'] as String? ?? '',
                        style: TextStyle(height: 1.5, color: LayoutTokens.primaryText(context)),
                      ),
                    ),
                ],
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _heroTag(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.24)),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white),
      ),
    );
  }
}
