import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:u_sports_mobile/services/app_update.dart';
import 'package:u_sports_mobile/widgets/update_available_card.dart';

Widget host(Override o) => ProviderScope(
      overrides: [o],
      child: const MaterialApp(home: Scaffold(body: UpdateAvailableCard())),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows the new version with Update and Later', (tester) async {
    await tester.pumpWidget(host(appUpdateProvider.overrideWith(
      (ref) async => AppUpdate(version: '9.9.9', downloadUrl: 'https://example.test/U-Sports.apk'),
    )));
    await tester.pumpAndSettle();
    expect(find.textContaining('Version 9.9.9 is available'), findsOneWidget);
    expect(find.text('Update'), findsOneWidget);
    expect(find.text('Later'), findsOneWidget);
  });

  testWidgets('shows nothing when there is no newer version', (tester) async {
    await tester.pumpWidget(host(appUpdateProvider.overrideWith((ref) async => null)));
    await tester.pumpAndSettle();
    expect(find.textContaining('is available'), findsNothing);
  });

  testWidgets('Later remembers the version it dismissed', (tester) async {
    await tester.pumpWidget(host(appUpdateProvider.overrideWith(
      (ref) async => AppUpdate(version: '9.9.9', downloadUrl: 'https://example.test/U-Sports.apk'),
    )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Later'));
    await tester.pumpAndSettle();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('usports.update.dismissedVersion'), '9.9.9');
  });
}
