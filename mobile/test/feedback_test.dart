import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/services/api_service.dart';
import 'package:u_sports_mobile/utils/feedback.dart';

Future<BuildContext> _pumpHost(WidgetTester tester) async {
  late BuildContext captured;
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) {
            captured = context;
            return const SizedBox();
          },
        ),
      ),
    ),
  );
  return captured;
}

void main() {
  testWidgets('showSuccess shows a green snackbar with a check', (tester) async {
    final context = await _pumpHost(tester);
    showSuccess(context, 'Saved changes for Juan');
    await tester.pump();
    expect(find.text('Saved changes for Juan'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
    final bar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(bar.backgroundColor, isNot(equals(Colors.red)));
  });

  testWidgets('showError shows a red snackbar with a cross', (tester) async {
    final context = await _pumpHost(tester);
    showError(context, 'Jersey number 7 is already taken.');
    await tester.pump();
    expect(find.text('Jersey number 7 is already taken.'), findsOneWidget);
    expect(find.byIcon(Icons.error_rounded), findsOneWidget);
  });

  testWidgets('showFailure uses the server sentence for a refused action', (tester) async {
    final context = await _pumpHost(tester);
    showFailure(context, ApiException(400, 'Lineup is full.'));
    await tester.pump();
    expect(find.text('Lineup is full.'), findsOneWidget);
  });

  testWidgets('a newer message replaces the one on screen', (tester) async {
    final context = await _pumpHost(tester);
    showSuccess(context, 'First');
    await tester.pump();
    showError(context, 'Second');
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Second'), findsOneWidget);
    expect(find.text('First'), findsNothing);
  });
}
