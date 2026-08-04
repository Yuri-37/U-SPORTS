import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../utils/format_helpers.dart';

/// Dismissible public banner row (display_mode = banner).
class HubAnnouncementStrip extends StatefulWidget {
  const HubAnnouncementStrip({super.key, required this.announcements});

  final List<Map<String, dynamic>> announcements;

  @override
  State<HubAnnouncementStrip> createState() => _HubAnnouncementStripState();
}

class _HubAnnouncementStripState extends State<HubAnnouncementStrip> {
  final Set<String> _dismissed = {};

  String _heading(Map<String, dynamic> a) {
    final t = a['type'] as String? ?? '';
    if (t == 'emergency') return 'Emergency';
    if (t == 'reschedule') return 'Rescheduled';
    return (a['title'] as String?)?.trim().isNotEmpty == true
        ? a['title'] as String
        : 'Announcement';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final banners = widget.announcements
        .where((a) =>
            a['display_mode'] == 'banner' &&
            !_dismissed.contains(a['id']?.toString()))
        .toList();
    if (banners.isEmpty) return const SizedBox.shrink();

    return Column(
      children: banners.map((a) {
        final id = a['id']?.toString() ?? '';
        final critical = a['urgency'] == 'critical';
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Material(
            color: critical
                ? AppTheme.danger.withValues(alpha: 0.12)
                : AppTheme.warning.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_heading(a),
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color:
                                  critical ? AppTheme.danger : AppTheme.warning,
                            )),
                        const SizedBox(height: 4),
                        Text(a['body'] as String? ?? '',
                            style:
                                TextStyle(fontSize: 13, color: cs.onSurface)),
                        if (a['new_scheduled_at'] != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              'New time: ${formatDateTime(a['new_scheduled_at'] as String?)}'
                              '${a['new_venue'] != null ? ' · ${a['new_venue']}' : ''}',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.color),
                            ),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => setState(() => _dismissed.add(id)),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// Marquee-style hero ticker for `hero_slider` mode — one bar per
/// announcement, colored by urgency (danger for critical, warning
/// otherwise), matching the web hero ticker (AnnouncementBanner.tsx)
/// exactly rather than a fixed brand-color gradient regardless of urgency.
/// Scroll speed matches web (`ticker-scroll`, 14s per loop).
class HubAnnouncementTicker extends StatelessWidget {
  const HubAnnouncementTicker({super.key, required this.announcements});

  final List<Map<String, dynamic>> announcements;

  String _heading(Map<String, dynamic> a) {
    final type = a['type'] as String? ?? '';
    final title = (a['title'] as String?)?.trim() ?? '';
    if (type == 'reschedule') return '📅 Rescheduled: $title';
    return title;
  }

  String _line(Map<String, dynamic> a) {
    final parts = <String>[_heading(a), a['body'] as String? ?? ''];
    if (a['new_scheduled_at'] != null) {
      final venue = a['new_venue'] != null ? ' · ${a['new_venue']}' : '';
      parts.add(
          'New time: ${formatDateTime(a['new_scheduled_at'] as String?)}$venue');
    }
    return '${parts.where((p) => p.isNotEmpty).join('   ')}   ◆';
  }

  @override
  Widget build(BuildContext context) {
    final slider =
        announcements.where((a) => a['display_mode'] == 'hero_slider').toList();
    if (slider.isEmpty) return const SizedBox.shrink();

    return Column(
      children: slider.map((a) {
        final critical = a['urgency'] == 'critical';
        final urgencyColor = critical ? AppTheme.danger : AppTheme.warning;
        return Container(
          height: 36,
          decoration: BoxDecoration(
            color: urgencyColor.withValues(alpha: critical ? 0.15 : 0.10),
            border: Border(
                bottom: BorderSide(color: urgencyColor.withValues(alpha: 0.3))),
          ),
          child: _MarqueeText(
            text: _line(a),
            color: urgencyColor,
            icon: critical ? Icons.warning_rounded : Icons.access_time_rounded,
          ),
        );
      }).toList(),
    );
  }
}

class _MarqueeText extends StatefulWidget {
  const _MarqueeText({required this.text, required this.color, this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  State<_MarqueeText> createState() => _MarqueeTextState();
}

class _MarqueeTextState extends State<_MarqueeText>
    with SingleTickerProviderStateMixin {
  /// Same duration as web `animation: 'ticker-scroll 14s linear infinite'`.
  static const Duration _loopDuration = Duration(seconds: 14);

  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: _loopDuration)..repeat();
  }

  @override
  void didUpdateWidget(_MarqueeText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.text != widget.text) {
      _c
        ..reset()
        ..repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  static const TextStyle _style = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.5,
  );

  /// One copy is at least viewport-wide (like web `minWidth: 100vw` on each
  /// ticker segment). Reserves space for the leading icon too, since it
  /// scrolls with the text (matching web, where the icon lives inside the
  /// same repeating ticker copy) rather than sitting fixed outside it.
  static const double _iconReserve = 22.0;

  double _segmentWidth(double viewportWidth) {
    final tp = TextPainter(
      text: TextSpan(text: widget.text, style: _style),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: double.infinity);
    const horizontalPadding = 64.0;
    final iconReserve = widget.icon != null ? _iconReserve : 0.0;
    return math.max(viewportWidth, tp.width + horizontalPadding + iconReserve);
  }

  Widget _segment(double segmentWidth) {
    return SizedBox(
      width: segmentWidth,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 14, color: widget.color),
                const SizedBox(width: 8),
              ],
              Text(
                widget.text,
                style: _style.copyWith(color: widget.color),
                maxLines: 1,
                softWrap: false,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final segmentWidth = _segmentWidth(w);
    final row = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _segment(segmentWidth),
        _segment(segmentWidth),
      ],
    );

    // The row is deliberately laid out wider than the viewport (two
    // viewport-wide copies, shifted via Transform.translate) so the scroll
    // loop reads as continuous. OverflowBox tells Flutter that's intentional
    // — without it, RenderFlex paints its debug-only "OVERFLOWED BY n
    // PIXELS" hazard-stripe warning on top, since it only sees a Row wider
    // than its own incoming constraint and has no way to know the ancestor
    // ClipRRect is already clipping the visible result correctly.
    return OverflowBox(
      maxWidth: double.infinity,
      alignment: Alignment.centerLeft,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          return Transform.translate(
            offset: Offset(-_c.value * segmentWidth, 0),
            child: row,
          );
        },
      ),
    );
  }
}
