import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../providers/auth_provider.dart';
import '../providers/announcements_provider.dart';
import '../providers/hub_champions_provider.dart';
import '../providers/hub_live_provider.dart';
import '../providers/hub_recent_events_provider.dart';
import '../providers/institution_provider.dart';
import '../providers/notifications_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/event_placements.dart';
import '../utils/sport_helpers.dart';
import '../widgets/announcement_banner.dart';
import '../widgets/double_back_exit.dart';
import '../widgets/event_card.dart';
import '../widgets/hub_live_match_sheet.dart';
import '../widgets/institution_brand.dart';
import '../widgets/institution_logo.dart';
import '../widgets/live_match_card.dart';
import '../widgets/ui/brand_page.dart';
import '../widgets/ui/hub_header_actions.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  /// Hero summary: the school's mark, then the two figures that matter on
  /// arrival -- what is being played now, and what is open.
  Widget _hero(InstitutionData? ins) {
    final live = ref.watch(hubLiveProvider).valueOrNull?.matches.length ?? 0;
    final open = ref.watch(hubRecentEventsProvider).valueOrNull?.length ?? 0;
    final abbr = ins?.abbreviation;
    final tagline = ins?.tagline;
    final logo = ins?.logoUrl?.trim();
    final schoolName = (ins?.name.trim().isNotEmpty == true)
        ? ins!.name
        : (abbr?.isNotEmpty == true ? abbr! : 'Intramural sports');

    return Column(
      children: [
        const HeroPill(text: 'Live platform'),
        const SizedBox(height: 22),
        // The school, once: its crest, its name, its tagline. ("U-Sports" is
        // the header above, so it is not repeated here.)
        if (logo != null && logo.isNotEmpty) ...[
          InstitutionLogo(
            url: logo,
            height: 60,
            fallback: const SizedBox(height: 60),
          ),
          const SizedBox(height: 14),
        ],
        Text(
          schoolName,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AppTheme.display(size: 25, color: Colors.white, height: 1.15),
        ),
        if (tagline != null && tagline.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              tagline,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontStyle: FontStyle.italic,
                fontSize: 13.5,
              ),
            ),
          ),
        const SizedBox(height: 26),
        FrostedCard(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
          child: FrostedStats(
            stats: [
              (label: 'Playing now', value: '$live'),
              (label: 'Open events', value: '$open'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _locationFooter(BuildContext context, InstitutionData? ins) {
    final parts = [ins?.address, ins?.region].whereType<String>().map((s) => s.trim()).where((s) => s.isNotEmpty);
    final line = parts.join(', ');
    if (line.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.location_on_outlined, size: 16, color: LayoutTokens.mutedText(context)),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              line,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: LayoutTokens.mutedText(context)),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final institutionAsync = ref.watch(institutionProvider);
    final announcementsAsync = ref.watch(announcementsHubProvider);
    final liveAsync = ref.watch(hubLiveProvider);
    final recentAsync = ref.watch(hubRecentEventsProvider);
    final championsAsync = ref.watch(hubChampionsProvider);
    final role = ref.watch(profileProvider).valueOrNull?.role ?? 'guest';

    return DoubleBackToExit(
      child: BrandPage.scroll(
        showBack: false,
        titleWidget: const InstitutionBrandTitle(compact: true),
        actions: const [HubHeaderActions()],
        hero: _hero(institutionAsync.valueOrNull),
        onRefresh: () async {
          ref.invalidate(institutionProvider);
          ref.invalidate(announcementsHubProvider);
          ref.invalidate(hubLiveProvider);
          ref.invalidate(hubRecentEventsProvider);
          ref.invalidate(hubChampionsProvider);
          ref.invalidate(profileProvider);
          ref.invalidate(notificationsListProvider);
          ref.invalidate(unreadNotificationsCountProvider);
        },
        children: [
          if (role == 'guest')
            _PrimaryBanner(
              icon: Icons.login_rounded,
              title: 'Sign in as an athlete',
              subtitle: 'See your stats, schedule, and team roster',
              onTap: () => context.push('/auth/login'),
            ),
          if (role == 'athlete')
            SheetGroup(
              children: [
                SheetTile(
                  leading: const IconTile(icon: Icons.dashboard_customize_rounded),
                  title: 'My dashboard — stats, schedule, roster',
                  trailing: Icon(Icons.chevron_right_rounded, color: LayoutTokens.mutedText(context)),
                  // `go`, not `push` — this is a bottom-nav tab root inside the
                  // StatefulShellRoute; pushing it would stack a duplicate page
                  // on top of Home's own branch instead of switching tabs, and
                  // its DoubleBackToExit would then swallow the back button.
                  onTap: () => context.go('/athlete/dashboard'),
                ),
              ],
            ),
          announcementsAsync.when(
            data: (list) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                HubAnnouncementTicker(announcements: list),
                HubAnnouncementStrip(announcements: list),
              ],
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          championsAsync.when(
            data: (spots) {
              if (spots.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Gold trophy, not the red dot "Live now" uses below —
                  // sharing that dot made a finished-results section read as
                  // urgent/live, same as an actually-live match.
                  SectionHeader(
                    title: 'Recent champions',
                    leading: Icon(Icons.emoji_events_rounded, size: 20, color: LayoutTokens.warning(context)),
                  ),
                  SheetGroup(
                    children: spots.take(4).map((s) {
                      final lines = s.placements.map((p) {
                        final name = s.labels[p.participantId] ?? 'Participant';
                        return '${placementRankLabel(p.rank)}: $name';
                      }).join(' · ');
                      return SheetTile(
                        leading: IconTile(emoji: sportEmoji(s.sport), color: sportTint(context, s.sport)),
                        title: s.eventName,
                        subtitle: lines,
                        trailing: Icon(Icons.chevron_right_rounded, color: LayoutTokens.mutedText(context)),
                        onTap: () => context.push('/events/${s.eventId}'),
                      );
                    }).toList(),
                  ),
                ],
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          liveAsync.when(
            data: (snap) {
              if (snap.matches.isEmpty) return const SizedBox.shrink();
              const visibleCount = 3;
              final shown = snap.matches.take(visibleCount).toList();
              final remaining = snap.matches.length - shown.length;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SectionHeader(
                    title: 'Live now',
                    leading: Container(
                      width: 9,
                      height: 9,
                      decoration: BoxDecoration(color: LayoutTokens.danger(context), shape: BoxShape.circle),
                    ),
                    // `go`, not `push` — /events is a bottom-nav tab root.
                    trailing: remaining > 0
                        ? SectionLink(label: 'See $remaining more live →', onTap: () => context.go('/events'))
                        : null,
                  ),
                  ...shown.map((m) {
                    final mid = m['id'] as String;
                    final period = snap.periodByMatch[mid] ?? 1;
                    return LiveMatchCard(
                      match: m,
                      labels: snap.participantLabels,
                      period: period,
                      onWatch: () => showHubLiveMatchSheet(context, matchId: mid),
                    );
                  }),
                ],
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          SectionHeader(
            title: 'Events',
            // `go`, not `push` — /events is a bottom-nav tab root.
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SectionLink(label: 'Upcoming →', onTap: () => context.go('/events')),
                SectionLink(label: 'Past results →', onTap: () => context.go('/events?view=past')),
              ],
            ),
          ),
          recentAsync.when(
            data: (evs) {
              if (evs.isEmpty) {
                return const SheetMessage(text: 'No upcoming or live events to show here right now.');
              }
              // Capped — the "Upcoming →" / "Past results →" links above are
              // the "see more" path, so the home screen doesn't render them all.
              const visibleCount = 6;
              final shown = evs.length > visibleCount ? evs.sublist(0, visibleCount) : evs;
              return Column(
                children: [
                  for (final e in shown)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: EventCard(
                        hubCompact: true,
                        event: e,
                        onTap: () => context.push('/events/${e['id']}'),
                      ),
                    ),
                ],
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: LinearProgressIndicator(minHeight: 2),
            ),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SectionHeader(title: 'Browse by Sport'),
          Row(
            children: [
              Expanded(child: _browseSportCard(context, 'basketball')),
              const SizedBox(width: 10),
              Expanded(child: _browseSportCard(context, 'volleyball')),
              const SizedBox(width: 10),
              Expanded(child: _browseSportCard(context, 'table-tennis')),
            ],
          ),
          institutionAsync.when(
            data: (ins) => _locationFooter(context, ins),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _browseSportCard(BuildContext context, String sport) {
    final b = Theme.of(context).brightness;
    return Container(
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.cardShadow(b),
        border: b == Brightness.dark ? Border.all(color: LayoutTokens.borderSubtle(context)) : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          // Dedicated drill-down page (real push, real back arrow) rather than
          // switching to the Rankings tab.
          onTap: () => context.push('/sport/$sport'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 6),
            child: Column(
              children: [
                IconTile(emoji: sportEmoji(sport), color: sportTint(context, sport), size: 52),
                const SizedBox(height: 10),
                Text(
                  sportLabel(sport),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: LayoutTokens.primaryText(context),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The one primary call to action on a page: a solid navy card.
class _PrimaryBanner extends StatelessWidget {
  const _PrimaryBanner({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      borderRadius: BorderRadius.circular(20),
      color: AppTheme.schoolPrimary,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.plusJakartaSans(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.78), fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
