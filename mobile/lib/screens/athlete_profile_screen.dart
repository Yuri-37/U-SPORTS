import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/sport_helpers.dart';
import '../widgets/stat_chip.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

class AthleteProfileScreen extends ConsumerWidget {
  const AthleteProfileScreen({super.key, required this.athleteId});

  final String athleteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteAsync = ref.watch(_athletePublicProvider(athleteId));
    final statsAsync = ref.watch(_athleteStatsProvider(athleteId));
    final insAsync = ref.watch(_athleteInsightsProvider(athleteId));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/leaderboards');
            }
          },
        ),
        title: const Text('Athlete'),
      ),
      body: athleteAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (athlete) {
          if (athlete == null) {
            return const Center(child: Text('Athlete not found or not public.'));
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

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: AppTheme.schoolPrimary,
                    backgroundImage: avatar != null && avatar.isNotEmpty ? CachedNetworkImageProvider(avatar) : null,
                    child: avatar == null || avatar.isEmpty
                        ? Text(
                            name.isNotEmpty ? name[0].toUpperCase() : '?',
                            style: TextStyle(fontSize: 28, color: AppTheme.schoolSecondary, fontWeight: FontWeight.w900),
                          )
                        : null,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        Text('${sportEmoji(sport)} ${sportLabel(sport)}', style: TextStyle(color: LayoutTokens.secondaryText(context))),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            if (position != null && position.isNotEmpty) _InfoTag(label: position),
                            if (jersey != null) _InfoTag(label: '#$jersey'),
                            if (yearLevel != null && yearLevel.isNotEmpty) _InfoTag(label: yearLevel),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (stats != null) ...[
                const SizedBox(height: 24),
                const Text('Season stats', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    StatChip(label: 'GP', value: '$gp'),
                    ...highlights.map((h) => StatChip(label: h.label, value: h.value)),
                  ],
                ),
              ],
              if (insights.isNotEmpty) ...[
                const SizedBox(height: 24),
                const Text('Insights', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                ...insights.map(
                  (i) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Material(
                      color: LayoutTokens.cardBackground(context),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          i['insight_text'] as String? ?? '',
                          style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _InfoTag extends StatelessWidget {
  const _InfoTag({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: LayoutTokens.chipBackground(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: LayoutTokens.primaryText(context)),
      ),
    );
  }
}
