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
  test('items entering together step 100ms, capped at 400ms so everything lands by about 1.2s', () {
    expect(revealDelay(0), Duration.zero);
    expect(revealDelay(3), const Duration(milliseconds: 300));
    expect(revealDelay(50), const Duration(milliseconds: 400));
    expect(revealDelay(50) + const Duration(milliseconds: 800), lessThanOrEqualTo(const Duration(milliseconds: 1200)));
  });

  test('count-up runs 0 to the target and eases out', () {
    expect(countUpAt(0, 250), 0);
    expect(countUpAt(1, 250), 250);
    expect(countUpAt(0.5, 100), greaterThan(80));
    expect(countUpAt(9, 7), 7);
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

  testWidgets('a card starts low and small, overshoots, and ends settled', (tester) async {
    await tester.pumpWidget(_app(const RevealScope(child: Reveal(child: SizedBox(height: 100, child: Text('card'))))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));
    Offset at() => tester.getTopLeft(find.text('card'));
    final start = at().dy;
    await tester.pump(const Duration(milliseconds: 250));
    final mid = at().dy;
    expect(mid, lessThan(start + 70)); // already rising
    // sample the whole move: it must pass its resting spot (overshoot) before settling
    var minDy = double.infinity;
    for (var i = 0; i < 80; i++) {
      await tester.pump(const Duration(milliseconds: 10));
      final dy = at().dy;
      if (dy < minDy) minDy = dy;
    }
    await tester.pumpAndSettle();
    expect(minDy, lessThan(at().dy)); // overshot its resting spot on the way
  });

  testWidgets('rows alternate sides and headings slide in', (tester) async {
    await tester.pumpWidget(_app(const RevealScope(
      child: Column(children: [
        Reveal(kind: RevealKind.row, child: SizedBox(height: 40, child: Text('r0'))),
        Reveal(kind: RevealKind.row, child: SizedBox(height: 40, child: Text('r1'))),
        Reveal(kind: RevealKind.heading, child: SizedBox(height: 40, child: Text('h'))),
      ]),
    )));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump(const Duration(milliseconds: 60));
    final r0 = tester.getTopLeft(find.text('r0')).dx;
    final r1 = tester.getTopLeft(find.text('r1')).dx;
    final h = tester.getTopLeft(find.text('h')).dx;
    await tester.pumpAndSettle();
    final rest = tester.getTopLeft(find.text('r0')).dx;
    expect(r0, lessThan(rest)); // first row comes from the left
    expect(r1, greaterThan(tester.getTopLeft(find.text('r1')).dx)); // second from the right
    expect(h, lessThan(tester.getTopLeft(find.text('h')).dx)); // heading from the left
  });

  testWidgets('a stat counts up inside a scope and shows the final number without one', (tester) async {
    await tester.pumpWidget(_app(const RevealScope(child: CountUpText(value: '78%'))));
    await tester.pump(const Duration(milliseconds: 100));
    final early = (tester.widget<Text>(find.byType(Text)).data)!;
    expect(early, isNot('78%'));
    await tester.pumpAndSettle();
    expect(find.text('78%'), findsOneWidget);

    await tester.pumpWidget(_app(const CountUpText(value: '78%')));
    expect(find.text('78%'), findsOneWidget);
  });
}
