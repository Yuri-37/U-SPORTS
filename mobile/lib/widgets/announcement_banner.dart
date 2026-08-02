import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
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
    return (a['title'] as String?)?.trim().isNotEmpty == true ? a['title'] as String : 'Announcement';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final banners = widget.announcements
        .where((a) => a['display_mode'] == 'banner' && !_dismissed.contains(a['id']?.toString()))
        .toList();
    if (banners.isEmpty) return const SizedBox.shrink();

    return Column(
      children: banners.map((a) {
        final id = a['id']?.toString() ?? '';
        final critical = a['urgency'] == 'critical';
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Material(
            color: critical ? AppTheme.danger.withValues(alpha: 0.12) : AppTheme.warning.withValues(alpha: 0.12),
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
                              color: critical ? AppTheme.danger : AppTheme.warning,
                            )),
                        const SizedBox(height: 4),
                        Text(a['body'] as String? ?? '', style: TextStyle(fontSize: 13, color: cs.onSurface)),
                        if (a['new_scheduled_at'] != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              'New time: ${formatDateTime(a['new_scheduled_at'] as String?)}'
                              '${a['new_venue'] != null ? ' · ${a['new_venue']}' : ''}',
                              style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color),
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

/// Marquee-style hero ticker for `hero_slider` mode.
/// Scroll speed matches web hero ticker (`ticker-scroll`, 14s per loop).
class HubAnnouncementTicker extends StatelessWidget {
  const HubAnnouncementTicker({super.key, required this.announcements});

  final List<Map<String, dynamic>> announcements;

  String _line(Map<String, dynamic> a) {
    final t = a['type'] as String? ?? '';
    final head = t == 'emergency'
        ? 'Emergency'
        : t == 'reschedule'
            ? 'Rescheduled'
            : (a['title'] as String?) ?? 'Announcement';
    final body = a['body'] as String? ?? '';
    return '$head · $body';
  }

  @override
  Widget build(BuildContext context) {
    final slider = announcements.where((a) => a['display_mode'] == 'hero_slider').toList();
    if (slider.isEmpty) return const SizedBox.shrink();
    final text = slider.map(_line).join('   ◆   ');
    return Container(
      height: 40,
      margin: const EdgeInsets.only(bottom: 12),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.schoolPrimary, AppTheme.schoolPrimary.withValues(alpha: 0.75)],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: _MarqueeText(text: text, color: Colors.white),
      ),
    );
  }
}

class _MarqueeText extends StatefulWidget {
  const _MarqueeText({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  State<_MarqueeText> createState() => _MarqueeTextState();
}

class _MarqueeTextState extends State<_MarqueeText> with SingleTickerProviderStateMixin {
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

  /// One copy is at least viewport-wide (like web `minWidth: 100vw` on each ticker segment).
  double _segmentWidth(double viewportWidth) {
    final tp = TextPainter(
      text: TextSpan(text: widget.text, style: _style),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: double.infinity);
    const horizontalPadding = 64.0;
    return math.max(viewportWidth, tp.width + horizontalPadding);
  }

  Widget _segment(double segmentWidth) {
    return SizedBox(
      width: segmentWidth,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text(
            widget.text,
            style: _style.copyWith(color: widget.color),
            maxLines: 1,
            softWrap: false,
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
