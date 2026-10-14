import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/theme/app_theme.dart';
import 'package:u_sports_mobile/widgets/ui/app_sheet.dart';
import 'package:u_sports_mobile/widgets/ui/brand_page.dart';
import 'package:u_sports_mobile/widgets/ui/skeleton.dart';

Widget _app(Widget body, {bool reduce = false}) => MaterialApp(
      home: Builder(
        builder: (ctx) => MediaQuery(
          data: MediaQuery.of(ctx).copyWith(disableAnimations: reduce),
          child: Scaffold(body: SingleChildScrollView(child: body)),
        ),
      ),
    );

Color _firstBoxColor(WidgetTester tester) {
  final box = tester.widget<Container>(
    find.descendant(of: find.byType(SkeletonBox).first, matching: find.byType(Container)).first,
  );
  return (box.decoration! as BoxDecoration).color!;
}

void main() {
  group('skeletons', () {
    testWidgets('the shaped placeholders build without overflowing', (tester) async {
      await tester.pumpWidget(_app(const Column(children: [
        EventCardListSkeleton(count: 3),
        LiveMatchCardSkeleton(),
        SheetRowsSkeleton(count: 3),
        TableSkeleton(rows: 4),
      ])));
      expect(tester.takeException(), isNull);
      expect(find.byType(SkeletonBox), findsWidgets);
    });

    testWidgets('they pulse between two greys', (tester) async {
      await tester.pumpWidget(_app(const SheetRowsSkeleton(count: 1)));
      final a = _firstBoxColor(tester);
      await tester.pump(const Duration(milliseconds: 550));
      expect(_firstBoxColor(tester), isNot(a));
    });

    testWidgets('Remove animations: they sit still', (tester) async {
      await tester.pumpWidget(_app(const SheetRowsSkeleton(count: 1), reduce: true));
      final a = _firstBoxColor(tester);
      await tester.pump(const Duration(milliseconds: 550));
      expect(_firstBoxColor(tester), a);
    });
  });

  group('bottom sheets', () {
    testWidgets('tell the navigation bar to slide away while open, and back when closed', (tester) async {
      late BuildContext ctx;
      await tester.pumpWidget(MaterialApp(home: Builder(builder: (c) {
        ctx = c;
        return const Scaffold(body: SizedBox());
      })));
      expect(openSheets.value, 0);
      showAppSheet<void>(context: ctx, builder: (_) => const SizedBox(height: 100, child: Text('sheet')));
      await tester.pumpAndSettle();
      expect(openSheets.value, 1);
      expect(find.text('sheet'), findsOneWidget);
      Navigator.of(ctx).pop();
      await tester.pumpAndSettle();
      expect(openSheets.value, 0);
    });
  });

  group('the accent colour', () {
    final saved = AppTheme.schoolSecondary;
    tearDown(() => AppTheme.schoolSecondary = saved);

    testWidgets('first place sits on the secondary colour; the others do not', (tester) async {
      AppTheme.schoolSecondary = const Color(0xFFF4C430);
      await tester.pumpWidget(_app(const Column(children: [RankBadge(rank: 1), RankBadge(rank: 2)])));
      Color fill(int i) => ((tester.widget<Container>(find.descendant(of: find.byType(RankBadge).at(i), matching: find.byType(Container)).first)).decoration! as BoxDecoration).color!;
      expect(fill(0), const Color(0xFFF4C430));
      expect(fill(1), isNot(const Color(0xFFF4C430)));
    });
  });
}
