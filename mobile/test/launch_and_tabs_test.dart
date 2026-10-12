import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:u_sports_mobile/providers/institution_provider.dart';
import 'package:u_sports_mobile/theme/app_theme.dart';
import 'package:u_sports_mobile/widgets/ui/branch_fader.dart';

Widget _tabs(int index, {bool reduce = false}) => MaterialApp(
      home: Builder(
        builder: (ctx) => MediaQuery(
          data: MediaQuery.of(ctx).copyWith(disableAnimations: reduce),
          child: Scaffold(
            body: BranchFader(
              currentIndex: index,
              children: const [Text('home'), Text('rankings'), Text('events'), Text('profile'), Text('coach')],
            ),
          ),
        ),
      ),
    );

void main() {
  group('the school look is remembered between launches', () {
    final primary = AppTheme.schoolPrimary;
    final secondary = AppTheme.schoolSecondary;
    tearDown(() {
      AppTheme.schoolPrimary = primary;
      AppTheme.schoolSecondary = secondary;
      InstitutionCache.cached = null;
    });

    test('preload puts the saved colours and name in place before the first frame', () async {
      SharedPreferences.setMockInitialValues({
        'institution_look': jsonEncode({
          'id': 'i1',
          'name': 'Test University',
          'primary_color': '#123456',
          'secondary_color': '#ABCDEF',
        }),
      });
      await InstitutionCache.preload();
      expect(AppTheme.schoolPrimary, const Color(0xFF123456));
      expect(AppTheme.schoolSecondary, const Color(0xFFABCDEF));
      expect(InstitutionCache.cached?.name, 'Test University');
    });

    test('a fresh install, or a damaged cache, changes nothing', () async {
      SharedPreferences.setMockInitialValues({'institution_look': 'not json'});
      await InstitutionCache.preload();
      expect(AppTheme.schoolPrimary, primary);
      expect(InstitutionCache.cached, isNull);
    });

    test('the built-in colours are the school\'s current blue, not the old navy', () {
      expect(primary, const Color(0xFF0066FF));
    });
  });

  group('switching tabs', () {
    testWidgets('fades from the old tab to the new one, then only the new one is left', (tester) async {
      await tester.pumpWidget(_tabs(0));
      expect(find.text('home'), findsOneWidget);
      expect(find.text('events'), findsNothing); // offstage pages are not painted

      await tester.pumpWidget(_tabs(2));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('home'), findsOneWidget); // still fading out
      expect(find.text('events'), findsOneWidget); // already fading in

      await tester.pumpAndSettle();
      expect(find.text('home'), findsNothing);
      expect(find.text('events'), findsOneWidget);
    });

    testWidgets('Remove animations: swaps at once', (tester) async {
      await tester.pumpWidget(_tabs(0, reduce: true));
      await tester.pumpWidget(_tabs(1, reduce: true));
      await tester.pump();
      expect(find.text('home'), findsNothing);
      expect(find.text('rankings'), findsOneWidget);
    });
  });
}
