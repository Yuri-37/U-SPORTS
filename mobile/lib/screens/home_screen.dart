import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
import '../widgets/live_match_card.dart';
import '../widgets/notification_bell_icon_button.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  Widget _heroSection(InstitutionData? ins) {
    if (ins == null) return const SizedBox.shrink();
    final abbr = ins.abbreviation;
    final name = ins.name;
    final tagline = ins.tagline;
    final logoUrl = ins.logoUrl;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      // A Container does not clip to its own decoration radius by default, so
      // the offset corner block used to poke a hard square into the rounded
      // corner. Clipping keeps every decorative layer inside the card shape.
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.schoolPrimary, AppTheme.schoolPrimary.withValues(alpha: 0.75)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.cardShadow(Theme.of(context).brightness),
      ),
      // The dot grid and corner block mirror web's inverted hero treatment —
      // texture that reads as paper rather than as a pattern.
      //
      // `alignment` matters here: a non-positioned child of a Stack gets loose
      // constraints, so this Column shrink-wraps to its widest child. Without
      // an explicit alignment the Stack would default to topStart and pin that
      // shrink-wrapped column to the LEFT edge, which is what made the hero
      // look off-centre.
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: CustomPaint(painter: _DotGridPainter()),
            ),
          ),
          Positioned(
            right: -18,
            top: -18,
            child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(22),
              ),
            ),
          ),
          Column(
            children: [
              if (logoUrl != null && logoUrl.trim().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  // A fixed 48x48 square forced BoxFit.contain to shrink a wide
                  // (non-square) logo down to fit that width, rendering it tiny.
                  // Widen the box so contain has room to keep the logo readable.
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: CachedNetworkImage(imageUrl: logoUrl.trim(), height: 48, width: 160, fit: BoxFit.contain),
                  ),
                ),
              // Pill label, same component language as web's SectionLabel.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: AppTheme.schoolSecondary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 9),
                    Text('LIVE PLATFORM', style: AppTheme.labelMono(AppTheme.schoolSecondary)),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                abbr?.isNotEmpty == true ? abbr! : 'U-Sports',
                textAlign: TextAlign.center,
                style: AppTheme.display(size: 42, color: Colors.white),
              ),
              const SizedBox(height: 10),
              Text(
                name,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 15, height: 1.5),
              ),
              if (tagline != null && tagline.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(tagline, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white38, fontStyle: FontStyle.italic)),
                ),
              const SizedBox(height: 22),
              _frostedStatCard(),
              const SizedBox(height: 18),
              _quickActions(),
            ],
          ),
        ],
      ),
    );
  }

  /// Frosted card sitting on the gradient, holding the two figures that
  /// actually matter on arrival: what is being played now, and what is open.
  /// The inset top highlight is what makes it read as glass rather than as a
  /// flat translucent rectangle.
  Widget _frostedStatCard() {
    final live = ref.watch(hubLiveProvider).valueOrNull?.matches.length ?? 0;
    final open = ref.watch(hubRecentEventsProvider).valueOrNull?.length ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withValues(alpha: 0.18),
            Colors.white.withValues(alpha: 0.06),
          ],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text('PLAYING NOW', style: AppTheme.labelMono(Colors.white70)),
                const SizedBox(height: 8),
                Text('$live', style: AppTheme.display(size: 30, color: Colors.white)),
              ],
            ),
          ),
          Container(width: 1, height: 44, color: Colors.white.withValues(alpha: 0.2)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text('OPEN EVENTS', style: AppTheme.labelMono(Colors.white70)),
                const SizedBox(height: 8),
                Text('$open', style: AppTheme.display(size: 30, color: Colors.white)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Four equal quick actions across the hero. Labels are solid white rather
  /// than translucent — on a gradient, low-opacity text is the first thing to
  /// become unreadable.
  Widget _quickActions() {
    final actions = <({IconData icon, String label, String route})>[
      (icon: Icons.emoji_events_outlined, label: 'Standings', route: '/leaderboards'),
      (icon: Icons.calendar_today_outlined, label: 'Events', route: '/events'),
      (icon: Icons.sports_basketball_outlined, label: 'Sports', route: '/sport/basketball'),
      (icon: Icons.groups_outlined, label: 'Teams', route: '/leaderboards'),
    ];

    return Row(
      children: actions.map((a) {
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Material(
              color: Colors.white.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => context.push(a.route),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    children: [
                      Icon(a.icon, color: Colors.white, size: 22),
                      const SizedBox(height: 7),
                      Text(
                        a.label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _locationFooter(BuildContext context, InstitutionData? ins) {
    final parts = [ins?.address, ins?.region].whereType<String>().map((s) => s.trim()).where((s) => s.isNotEmpty);
    final line = parts.join(', ');
    if (line.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 20),
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
    final profileAsync = ref.watch(profileProvider);
    final role = profileAsync.valueOrNull?.role ?? 'guest';
    final profile = profileAsync.valueOrNull;

    return DoubleBackToExit(
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const InstitutionBrandTitle(compact: true),
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
      ),
      body: RefreshIndicator(
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
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (role == 'guest')
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Material(
                  borderRadius: BorderRadius.circular(14),
                  color: AppTheme.accent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => context.push('/auth/login'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.login_rounded, color: Colors.white, size: 22),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Sign in as an athlete',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                                ),
                                SizedBox(height: 2),
                                Text(
                                  'See your stats, schedule, and team roster',
                                  style: TextStyle(color: Colors.white70, fontSize: 12.5),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right, color: Colors.white),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (role == 'athlete')
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Material(
                  color: AppTheme.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    // `go`, not `push` — this is a bottom-nav tab root inside the
                    // StatefulShellRoute; pushing it would stack a duplicate page
                    // on top of Home's own branch instead of switching tabs, and
                    // its DoubleBackToExit would then swallow the back button.
                    onTap: () => context.go('/athlete/dashboard'),
                    child: const Padding(
                      padding: EdgeInsets.all(14),
                      child: Row(
                        children: [
                          Icon(Icons.dashboard_customize, color: AppTheme.accent),
                          SizedBox(width: 12),
                          Expanded(child: Text('My dashboard — stats, schedule, roster', style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.accent))),
                          Icon(Icons.chevron_right, color: AppTheme.accent),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            institutionAsync.when(
              data: (ins) => _heroSection(ins),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            announcementsAsync.when(
              data: (list) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 20),
                    // Gold trophy, not the red dot "Live now" uses below —
                    // sharing that dot made a finished-results section read
                    // as urgent/live, same as an actually-live match.
                    Row(
                      children: [
                        const Icon(Icons.emoji_events, size: 18, color: AppTheme.warning),
                        const SizedBox(width: 8),
                        Text(
                          'Recent champions',
                          style: AppTheme.display(
                            size: 22,
                            height: 1.2,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ...spots.take(4).map((s) {
                      final lines = s.placements.map((p) {
                        final name = s.labels[p.participantId] ?? 'Participant';
                        return '${placementRankLabel(p.rank)}: $name';
                      }).join(' · ');
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Material(
                          color: LayoutTokens.cardBackground(context),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                          ),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => context.push('/events/${s.eventId}'),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  Text(sportEmoji(s.sport), style: const TextStyle(fontSize: 22)),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(s.eventName, style: TextStyle(fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurface)),
                                        Text(lines, style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context))),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Container(width: 10, height: 10, decoration: const BoxDecoration(color: AppTheme.danger, shape: BoxShape.circle)),
                        const SizedBox(width: 8),
                        Text(
                          'Live now',
                          style: AppTheme.display(
                            size: 22,
                            height: 1.2,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
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
                    if (remaining > 0)
                      TextButton(
                        // `go`, not `push` — /events is a bottom-nav tab root, see note below.
                        onPressed: () => context.go('/events'),
                        style: TextButton.styleFrom(foregroundColor: LayoutTokens.secondaryText(context)),
                        child: Text('See $remaining more live →'),
                      ),
                  ],
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Events',
                  style: AppTheme.display(
                    size: 22,
                    height: 1.2,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                const Spacer(),
                // `go`, not `push` — see note on the dashboard banner above;
                // /events is a bottom-nav tab root.
                // Secondary text color, not the default accent blue — blue is
                // reserved for the one primary action (Sign in) above; every
                // link on this screen sharing it made nothing stand out.
                TextButton(
                  onPressed: () => context.go('/events'),
                  style: TextButton.styleFrom(foregroundColor: LayoutTokens.secondaryText(context)),
                  child: const Text('Upcoming →'),
                ),
                TextButton(
                  onPressed: () => context.go('/events?view=past'),
                  style: TextButton.styleFrom(foregroundColor: LayoutTokens.secondaryText(context)),
                  child: const Text('Past results →'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            recentAsync.when(
              data: (evs) {
                if (evs.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'No upcoming or live events to show here right now.',
                      style: TextStyle(color: LayoutTokens.mutedText(context)),
                    ),
                  );
                }
                // Capped — the "Upcoming →" / "Past results →" links above
                // already exist as the "see more" path, so a long event list
                // doesn't need to render in full on the home screen too.
                const visibleCount = 6;
                final shown = evs.length > visibleCount ? evs.sublist(0, visibleCount) : evs;
                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.95,
                  ),
                  itemCount: shown.length,
                  itemBuilder: (ctx, i) {
                    final e = shown[i];
                    return EventCard(
                      hubCompact: true,
                      event: e,
                      onTap: () => context.push('/events/${e['id']}'),
                    );
                  },
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: LinearProgressIndicator(minHeight: 2),
              ),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            Text(
              'Browse by Sport',
              style: AppTheme.display(
                size: 22,
                height: 1.2,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _browseSportCard(context, 'basketball')),
                const SizedBox(width: 8),
                Expanded(child: _browseSportCard(context, 'volleyball')),
                const SizedBox(width: 8),
                Expanded(child: _browseSportCard(context, 'table-tennis')),
              ],
            ),
            institutionAsync.when(
              data: (ins) => _locationFooter(context, ins),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    ),
    );
  }

  Widget _browseSportCard(BuildContext context, String sport) {
    return Material(
      color: LayoutTokens.cardBackground(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: LayoutTokens.borderSubtle(context)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        // Dedicated drill-down page (real push, real back arrow) rather than
        // switching to the Standings tab — see conversation for rationale.
        onTap: () => context.push('/sport/$sport'),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 6),
          child: Column(
            children: [
              Text(sportEmoji(sport), style: const TextStyle(fontSize: 34)),
              const SizedBox(height: 8),
              Text(
                sportLabel(sport),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The hero's dot grid. Mirrors web's `.texture-dots`: white at very low
/// alpha on a 22px pitch, so it suggests texture without competing with the
/// text sitting on top of it.
class _DotGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.07);
    const pitch = 22.0;
    for (double y = pitch / 2; y < size.height; y += pitch) {
      for (double x = pitch / 2; x < size.width; x += pitch) {
        canvas.drawCircle(Offset(x, y), 1.1, paint);
      }
    }
  }

  // Nothing about the grid depends on state, so it never needs repainting.
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
