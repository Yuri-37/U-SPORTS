import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/motion.dart';

/// What is being revealed: a standalone card, one row of a list, or a section
/// heading.
enum RevealKind { card, row, heading }

/// Delay for the [index]th item that enters the screen in the same frame.
Duration revealDelay(int index) {
  final d = AppMotion.revealStep * (index < 0 ? 0 : index);
  return d > AppMotion.revealMaxDelay ? AppMotion.revealMaxDelay : d;
}

/// The number shown [progress] (0..1) of the way through a count-up, matching
/// the website: fast at first, then easing in.
int countUpAt(double progress, int target) {
  final p = progress.clamp(0.0, 1.0);
  return (target * (1 - (1 - p) * (1 - p) * (1 - p))).round();
}

/// Wraps one screen whose cards, rows and headings fly in as they scroll into
/// view, and whose stat numbers count up. Without it, [Reveal] and
/// [CountUpText] simply show their final state.
class RevealScope extends StatefulWidget {
  const RevealScope({super.key, required this.child});

  final Widget child;

  @override
  State<RevealScope> createState() => _RevealScopeState();
}

class _RevealScopeState extends State<RevealScope> {
  final Set<_RevealState> _pending = {};
  final Set<Object> _revealedIds = {};
  bool _interacted = false;
  bool _checkScheduled = false;
  int _rowCount = 0;

  bool _wasRevealed(Object? id) => id != null && _revealedIds.contains(id);

  void _register(_RevealState item) {
    _pending.add(item);
    _scheduleCheck();
  }

  void _unregister(_RevealState item) => _pending.remove(item);

  /// Positions are only final after layout, so every check runs after the frame.
  void _scheduleCheck() {
    if (_checkScheduled || _pending.isEmpty) return;
    _checkScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkScheduled = false;
      if (mounted) _check();
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void _check() {
    final scope = context.findRenderObject();
    if (scope is! RenderBox || !scope.hasSize || _pending.isEmpty) return;
    final top = scope.localToGlobal(Offset.zero).dy;
    final line = top + scope.size.height - AppMotion.revealInset;

    final entering = <({_RevealState item, Offset at})>[];
    for (final item in _pending.toList()) {
      final box = item.context.findRenderObject();
      if (box is! RenderBox || !box.attached || !box.hasSize) continue;
      final at = box.localToGlobal(Offset.zero);
      final inView = at.dy < line && at.dy + box.size.height > top;
      if (!item.checked) {
        item.checked = true;
        if (item.startedVisible) {
          // Mounted after a touch (tab, filter, refresh, live update): leave
          // what is already on screen alone; only what is below waits.
          if (inView) {
            _done(item);
          } else {
            item.hide();
          }
          continue;
        }
      }
      if (inView) entering.add((item: item, at: at));
    }

    entering.sort((a, b) => a.at.dy != b.at.dy ? a.at.dy.compareTo(b.at.dy) : a.at.dx.compareTo(b.at.dx));
    for (var i = 0; i < entering.length; i++) {
      final item = entering[i].item;
      _done(item);
      item.play(revealDelay(i));
    }
  }

  void _done(_RevealState item) {
    _pending.remove(item);
    final id = item.widget.id;
    if (id != null) _revealedIds.add(id);
  }

  bool _onScroll(Notification _) {
    _scheduleCheck();
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _interacted = true,
      child: NotificationListener<ScrollMetricsNotification>(
        onNotification: _onScroll,
        child: NotificationListener<ScrollNotification>(
          onNotification: _onScroll,
          child: widget.child,
        ),
      ),
    );
  }
}

/// One card, row or heading that flies in the first time it scrolls on screen:
/// it fades while rising (cards, from 85% size, settling with a small
/// overshoot), sliding in from alternating sides (rows) or sliding in from the
/// left (headings). Pass [id] in lazily built lists so a row rebuilt after being
/// scrolled away does not play again.
class Reveal extends StatefulWidget {
  const Reveal({super.key, required this.child, this.kind = RevealKind.card, this.id});

  final Widget child;
  final RevealKind kind;
  final Object? id;

  @override
  State<Reveal> createState() => _RevealState();
}

class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  late final Duration _move = switch (widget.kind) {
    RevealKind.card => AppMotion.revealCard,
    RevealKind.row => AppMotion.revealRow,
    RevealKind.heading => AppMotion.revealHeading,
  };
  late final Duration _fadeTime = widget.kind == RevealKind.row ? AppMotion.revealRowFade : AppMotion.revealCardFade;

  late final AnimationController _controller = AnimationController(vsync: this, duration: _move, value: 1);

  /// Opacity cannot overshoot, so it finishes early on a plain ease-out while
  /// the move carries on settling on the spring.
  late final Animation<double> _fade = CurvedAnimation(
    parent: _controller,
    curve: Interval(0, _fadeTime.inMilliseconds / _move.inMilliseconds, curve: Curves.easeOut),
  );
  late final Animation<double> _spring = CurvedAnimation(parent: _controller, curve: AppMotion.spring);

  _RevealScopeState? _scope;
  Timer? _delay;
  bool _started = false;
  bool checked = false;
  bool startedVisible = false;

  /// -1 slides in from the left, 1 from the right (rows alternate).
  double _side = -1;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still = MediaQuery.disableAnimationsOf(context);
    if (_started) {
      // Remove animations switched on while this was still waiting.
      if (still && _scope != null) {
        _scope!._unregister(this);
        _scope = null;
        _delay?.cancel();
        _controller.value = 1;
      }
      return;
    }
    _started = true;
    final scope = context.findAncestorStateOfType<_RevealScopeState>();
    if (scope == null || still || scope._wasRevealed(widget.id)) return; // stays at 1
    _scope = scope;
    if (widget.kind == RevealKind.row) _side = scope._rowCount++ % 2 == 0 ? -1 : 1;
    startedVisible = scope._interacted;
    _controller.value = startedVisible ? 1 : 0;
    scope._register(this);
  }

  @override
  void didUpdateWidget(covariant Reveal oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Content around a waiting item changed size (data arrived): look again.
    if (_controller.value == 0) _scope?._scheduleCheck();
  }

  void hide() => _controller.value = 0;

  void play(Duration delay) {
    if (delay == Duration.zero) {
      _controller.forward();
    } else {
      _delay = Timer(delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _delay?.cancel();
    _scope?._unregister(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      alwaysIncludeSemantics: true,
      child: AnimatedBuilder(
        animation: _spring,
        child: widget.child,
        builder: (context, child) {
          // 0 when settled; goes slightly negative on the overshoot.
          final left = 1 - _spring.value;
          if (left == 0) return child!;
          final Offset offset;
          final double scale;
          switch (widget.kind) {
            case RevealKind.card:
              offset = Offset(0, AppMotion.revealCardDistance * left);
              scale = 1 - (1 - AppMotion.revealCardStartScale) * left;
            case RevealKind.row:
              offset = Offset(_side * AppMotion.revealRowDistance * left, 0);
              scale = 1 - (1 - AppMotion.revealRowStartScale) * left;
            case RevealKind.heading:
              offset = Offset(-AppMotion.revealHeadingDistance * left, 0);
              scale = 1;
          }
          return Transform.translate(
            offset: offset,
            child: scale == 1 ? child : Transform.scale(scale: scale, child: child),
          );
        },
      ),
    );
  }
}

/// A stat figure that counts up from 0 to its value the first time it shows
/// (the leading number in [value], so "78%" counts 0%..78%). Counts only inside
/// a [RevealScope], not after a touch and not with Remove animations on; every
/// change after the first count shows at once, so a live figure never recounts.
class CountUpText extends StatefulWidget {
  const CountUpText({super.key, required this.value, this.style, this.textAlign});

  final String value;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  State<CountUpText> createState() => _CountUpTextState();
}

class _CountUpTextState extends State<CountUpText> with SingleTickerProviderStateMixin {
  static final _number = RegExp(r'^(\D*)(\d+)(.*)$');

  late final AnimationController _controller = AnimationController(vsync: this, duration: AppMotion.countUp);
  bool _played = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeStart();
  }

  @override
  void didUpdateWidget(covariant CountUpText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) _maybeStart();
  }

  void _maybeStart() {
    if (_played) return;
    final m = _number.firstMatch(widget.value);
    if (m == null || int.parse(m.group(2)!) == 0) return; // nothing to count to yet
    final scope = context.findAncestorStateOfType<_RevealScopeState>();
    if (scope == null || scope._interacted || MediaQuery.disableAnimationsOf(context)) {
      _played = true; // shows the final value from now on
      return;
    }
    _played = true;
    _controller.forward(from: 0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final style = widget.style?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final m = _number.firstMatch(widget.value);
        var text = widget.value;
        if (m != null && _controller.isAnimating) {
          final target = int.parse(m.group(2)!);
          text = '${m.group(1)}${countUpAt(_controller.value, target)}${m.group(3)}';
        }
        return Text(text, style: style, textAlign: widget.textAlign);
      },
    );
  }
}
