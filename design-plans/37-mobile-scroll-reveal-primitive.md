# 37 — Android: one scroll-reveal widget, built from Flutter's own tools

- **Status**: TODO
- **Commit**: c5ef129
- **Severity**: MEDIUM (missed opportunity: entrance)
- **Category**: Missed opportunities (also Cohesion & tokens, Accessibility)
- **Estimated scope**: 1 new widget file, 1 new test, 2 edited files (`theme/motion.dart`, `widgets/ui/brand_page.dart`), about 220 lines
- **Part of**: scroll reveal, mobile (37 → 38 → 39). Web counterpart: plan 33. Its rules and numbers are the contract this plan copies.

## Problem

Content in the app appears all at once, with no entrance as it comes into view. The website's public pages are getting a scroll reveal (plans 33-36): cards fade and rise 8px, rows 4px, once each, as they cross a line near the bottom of the screen. The same hub, events, event, rankings and team content in the app should behave the same way.

The web plan relies on `IntersectionObserver` and CSS, which do not exist in Flutter. The app has no visibility-detection helper either (`grep -rn "visibility_detector\|inview" mobile/lib mobile/pubspec.yaml` finds nothing).

**No new package is needed.** Every piece exists in the framework:

| Need | Flutter tool |
| --- | --- |
| Know when the user scrolls | `NotificationListener<ScrollNotification>` |
| Know when content grows or shrinks without scrolling | `NotificationListener<ScrollMetricsNotification>` |
| Read an item's position on screen | `RenderBox.localToGlobal`, after the frame (`WidgetsBinding.addPostFrameCallback`) |
| Notice the first touch | `Listener(onPointerDown:)` |
| The motion | `AnimationController`, `CurvedAnimation`, `FadeTransition`, `Transform.translate` |
| Reduce motion | `MediaQuery.disableAnimationsOf(context)` |

`visibility_detector` would add a dependency to do the first three, and it reports with a debounce delay of about 500ms by default. That is too late for a 300ms entrance.

## Target

Two widgets in `mobile/lib/widgets/ui/reveal.dart`:

- **`RevealScope`** wraps one screen. It plays the part of the web page's single observer: it tracks the items still waiting, rechecks them after every scroll frame, and reveals those that crossed the line.
- **`Reveal`** wraps one item: `Reveal(child: …)` for a card, `Reveal(kind: RevealKind.row, child: …)` for a list row. Without a `RevealScope` above it, `Reveal` shows its child at once. This is how auth, settings and coach screens stay unaffected even if a shared widget contains a `Reveal`.

**The rules.** These are the same as plan 33.

| Rule | Mobile implementation |
| --- | --- |
| Kinds | `card`: 8 logical px, 300ms. `row`: 4px, 200ms. Both use `AppMotion.easeOutStrong`. |
| Trigger line | 48 logical px above the bottom of the scope (the visible screen area above the bottom navigation). Fixed, so the last item on a short page always crosses it. |
| Once | A revealed item is removed from the scope. For lazily built lists, pass `id:`; the scope remembers revealed ids, so an item that is scrolled far away, disposed and rebuilt does not replay. |
| Batch stagger | Items found entering in the same check are sorted by y, then x. Delay is `min(index × step, max)`: cards 40ms up to 200ms, rows 20ms up to 120ms. |
| After interaction, on-screen = instant | After the first `onPointerDown` inside the scope, a newly mounted `Reveal` starts fully visible. On its first check, if it is below the line, it is hidden (it is off screen, so no flash) and waits for scrolling. Tab switches, filters, search, pull-to-refresh and polling updates after a touch never animate what is already on screen. |
| Reduce motion | With `MediaQuery.disableAnimationsOf(context)` (Android "Remove animations"), a `Reveal` shows its child at once and never registers. If the setting turns on while an item waits, it is shown at once. |
| Screen readers | `FadeTransition(alwaysIncludeSemantics: true)`, so TalkBack can reach an item that is still waiting. |
| No blur, no scale | Fade plus vertical translate only. |

Why `Transform.translate` and not `SlideTransition`: `SlideTransition` moves a fraction of the child's own size, so a 600px-tall card would travel 48px and a 60px row 5px. The contract is a fixed 8px or 4px, the same as web's `0.5rem` and `0.25rem`. At rest the translate is zero, and Flutter paints a pure translation without an extra layer.

## Steps

1. **`mobile/lib/theme/motion.dart`.** Add these inside `AppMotion`, after `scoreChange`:

   ```dart
     // Scroll reveal. Mirrors apps/web/src/lib/scrollReveal.ts and the
     // [data-reveal] rules in apps/web/src/styles/index.css.

     /// A card fading and rising into view.
     static const Duration revealCard = Duration(milliseconds: 300);

     /// A list row fading and rising into view: quicker and smaller than a card.
     static const Duration revealRow = Duration(milliseconds: 200);

     static const double revealCardDistance = 8;
     static const double revealRowDistance = 4;

     /// Gap between items that come into view together, and the longest any waits.
     static const Duration revealCardStep = Duration(milliseconds: 40);
     static const Duration revealRowStep = Duration(milliseconds: 20);
     static const Duration revealCardMaxDelay = Duration(milliseconds: 200);
     static const Duration revealRowMaxDelay = Duration(milliseconds: 120);

     /// How far above the bottom of the screen an item must be before it reveals.
     static const double revealInset = 48;
   ```

2. **Create `mobile/lib/widgets/ui/reveal.dart`:**

   ```dart
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
   ```

   Notes for the executor:
   - The controller starts at `value: 1`, so anything outside a scope, or with reduced motion, is fully visible from its first frame.
   - `_check` reads positions only inside a post-frame callback, never during layout.
   - Checking is a loop over the items still waiting, usually fewer than 30. Revealed items leave the set, so a fully revealed screen costs nothing per frame.
   - Items in a scope that is not on screen never cross the line, so they just wait. Examples are an inactive tab of the shell's `IndexedStack`, or a `TabBarView` page during a swipe; the test is vertical only.

3. **`mobile/lib/widgets/ui/brand_page.dart`, `SheetGroup`.** Let a group reveal its rows one by one, each together with the hairline above it, so the hairlines never show before their rows.
   - Add the import `import 'reveal.dart';`.
   - Add a field `final bool revealRows;` with constructor default `this.revealRows = false`, documented as:

     ```dart
       /// Rows fade and rise in one by one as they scroll into view (needs a
       /// [RevealScope] above; otherwise they simply show).
     ```

   - Replace the row-building loop in `build` with:

     ```dart
         final rows = <Widget>[];
         for (var i = 0; i < children.length; i++) {
           final divider = i > 0 && dividers
               ? Divider(height: 1, indent: 16, endIndent: 16, color: LayoutTokens.borderSubtle(context))
               : null;
           if (revealRows) {
             rows.add(Reveal(
               kind: RevealKind.row,
               child: divider == null
                   ? children[i]
                   : Column(
                       crossAxisAlignment: CrossAxisAlignment.stretch,
                       mainAxisSize: MainAxisSize.min,
                       children: [divider, children[i]],
                     ),
             ));
           } else {
             if (divider != null) rows.add(divider);
             rows.add(children[i]);
           }
         }
     ```

   - Every existing call site keeps `revealRows: false`, so nothing changes until plans 38 and 39 opt in.

4. **Create `mobile/test/reveal_test.dart`:**

   ```dart
   import 'package:flutter/material.dart';
   import 'package:flutter_test/flutter_test.dart';
   import 'package:u_sports_mobile/widgets/ui/reveal.dart';

   Widget _app(Widget body, {bool reduce = false}) => MaterialApp(
         home: Builder(
           builder: (ctx) => MediaQuery(
             data: MediaQuery.of(ctx).copyWith(disableAnimations: reduce),
             child: Scaffold(body: body),
           ),
         ),
       );

   double _opacity(WidgetTester tester, String text) => tester
       .widget<FadeTransition>(find.ancestor(of: find.text(text), matching: find.byType(FadeTransition)).first)
       .opacity
       .value;

   Widget _tall(String below) => RevealScope(
         child: SingleChildScrollView(
           child: Column(children: [
             const Reveal(child: SizedBox(height: 100, child: Text('top'))),
             const SizedBox(height: 2000),
             Reveal(child: SizedBox(height: 100, child: Text(below))),
           ]),
         ),
       );

   void main() {
     test('items entering together step 40ms for cards and 20ms for rows, capped', () {
       expect(revealDelay(0, RevealKind.card), Duration.zero);
       expect(revealDelay(3, RevealKind.card), const Duration(milliseconds: 120));
       expect(revealDelay(3, RevealKind.row), const Duration(milliseconds: 60));
       expect(revealDelay(50, RevealKind.card), const Duration(milliseconds: 200));
       expect(revealDelay(50, RevealKind.row), const Duration(milliseconds: 120));
     });

     testWidgets('without a RevealScope the child shows at once', (tester) async {
       await tester.pumpWidget(_app(const Reveal(child: Text('plain'))));
       expect(_opacity(tester, 'plain'), 1);
     });

     testWidgets('on screen at load: fades in', (tester) async {
       await tester.pumpWidget(_app(_tall('below')));
       expect(_opacity(tester, 'top'), 0);
       await tester.pumpAndSettle();
       expect(_opacity(tester, 'top'), 1);
     });

     testWidgets('below the fold waits until scrolled to, then reveals once', (tester) async {
       await tester.pumpWidget(_app(_tall('below')));
       await tester.pumpAndSettle();
       expect(_opacity(tester, 'below'), 0);
       await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -1800));
       await tester.pumpAndSettle();
       expect(_opacity(tester, 'below'), 1);
     });

     testWidgets('Remove animations: everything shows at once', (tester) async {
       await tester.pumpWidget(_app(_tall('below'), reduce: true));
       expect(_opacity(tester, 'top'), 1);
       expect(_opacity(tester, 'below'), 1);
     });

     testWidgets('mounted on screen after a touch: no entrance', (tester) async {
       var show = false;
       await tester.pumpWidget(_app(RevealScope(
         child: StatefulBuilder(
           builder: (ctx, setState) => Column(children: [
             TextButton(onPressed: () => setState(() => show = true), child: const Text('show')),
             if (show) const Reveal(child: Text('added')),
           ]),
         ),
       )));
       await tester.tap(find.text('show'));
       await tester.pump();
       expect(_opacity(tester, 'added'), 1);
       await tester.pump(const Duration(milliseconds: 50));
       expect(_opacity(tester, 'added'), 1);
     });
   }
   ```

## Boundaries

- Do NOT add a package. If the approach above proves impossible, STOP and report why before reaching for `visibility_detector` or any other dependency.
- Do NOT wrap any screen in `RevealScope` in this plan. Plans 38 and 39 do that for the six in-scope screens only.
- Never wrap auth, settings, notifications, athlete dashboard or coach screens. Without a scope, a `Reveal` there is inert.
- Do NOT change `SheetGroup`'s look when `revealRows` is false.
- Do NOT add blur, scale or a hero animation.

## Verification

- **Mechanical**: `cd mobile && flutter analyze` reports no issues, and `flutter test` passes (the 26 existing tests plus the 6 new ones).
- **Behavior**: none yet, because no screen has a scope. Plans 38 and 39 carry the device checks.
- **Done when**: the `AppMotion.reveal*` tokens, `reveal.dart`, `SheetGroup.revealRows` and `reveal_test.dart` exist, and analyze and test are clean.
