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
