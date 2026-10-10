import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/widgets/ui/animated_score.dart';

Widget _host(int value) => MaterialApp(
      home: Scaffold(
        body: AnimatedScore(value: value, style: const TextStyle(fontSize: 30)),
      ),
    );

double _opacityAbove(WidgetTester tester, String text) {
  final fade = tester.widget<FadeTransition>(
    find.ancestor(of: find.text(text), matching: find.byType(FadeTransition)).first,
  );
  return fade.opacity.value;
}

void main() {
  testWidgets('first build shows the value with no entrance animation', (tester) async {
    await tester.pumpWidget(_host(3));
    expect(find.text('3'), findsOneWidget);
    expect(_opacityAbove(tester, '3'), 1.0);
  });

  testWidgets('a change hides the old value at once and eases the new one in', (tester) async {
    await tester.pumpWidget(_host(3));
    await tester.pumpWidget(_host(5));
    await tester.pump(const Duration(milliseconds: 100));

    expect(_opacityAbove(tester, '3'), 0.0);
    final incoming = _opacityAbove(tester, '5');
    expect(incoming, greaterThan(0.0));
    expect(incoming, lessThan(1.0));

    await tester.pumpAndSettle();
    expect(find.text('3'), findsNothing);
    expect(find.text('5'), findsOneWidget);
  });
}
