import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/motion.dart';

/// What is being revealed: a standalone card, or one row of a list.
enum RevealKind { card, row }

/// Delay for the [index]th item that enters the screen in the same frame.
Duration revealDelay(int index, RevealKind kind) {
  final step = kind == RevealKind.row ? AppMotion.revealRowStep : AppMotion.revealCardStep;
  final max = kind == RevealKind.row ? AppMotion.revealRowMaxDelay : AppMotion.revealCardMaxDelay;
  final d = step * (index < 0 ? 0 : index);
  return d > max ? max : d;
}

/// Wraps one screen whose cards and rows reveal as they scroll into view.
/// Without it, [Reveal] shows its child straight away.
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
      item.play(revealDelay(i, item.widget.kind));
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

/// One card or row that fades and rises into view the first time it scrolls
/// on screen. Pass [id] in lazily built lists so a row rebuilt after being
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
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.kind == RevealKind.row ? AppMotion.revealRow : AppMotion.revealCard,
    value: 1,
  );
  late final Animation<double> _t = CurvedAnimation(parent: _controller, curve: AppMotion.easeOutStrong);
  _RevealScopeState? _scope;
  Timer? _delay;
  bool _started = false;
  bool checked = false;
  bool startedVisible = false;

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
    final distance = widget.kind == RevealKind.row ? AppMotion.revealRowDistance : AppMotion.revealCardDistance;
    return FadeTransition(
      opacity: _t,
      alwaysIncludeSemantics: true,
      child: AnimatedBuilder(
        animation: _t,
        builder: (context, child) =>
            Transform.translate(offset: Offset(0, distance * (1 - _t.value)), child: child),
        child: widget.child,
      ),
    );
  }
}
