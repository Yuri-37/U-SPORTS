import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/widgets/ui/person_avatar.dart';

Widget _host(Widget w) => MaterialApp(home: Scaffold(body: Center(child: w)));

void main() {
  testWidgets('no photo: the first initial on the school colour', (tester) async {
    await tester.pumpWidget(_host(const PersonAvatar(name: 'paolo Navarro', size: 30)));
    expect(find.text('P'), findsOneWidget);
  });

  testWidgets('a blank name still draws something', (tester) async {
    await tester.pumpWidget(_host(const PersonAvatar(name: '  ', imageUrl: '', size: 30)));
    expect(find.text('?'), findsOneWidget);
  });
}
