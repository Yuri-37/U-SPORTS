import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/services/app_update.dart';

void main() {
  test('a higher version is newer, compared by number not text', () {
    expect(isNewerVersion('1.10.8', '1.10.7'), isTrue);
    expect(isNewerVersion('1.10.0', '1.9.9'), isTrue);
    expect(isNewerVersion('2.0.0', '1.99.99'), isTrue);
  });

  test('the same or an older version is not newer', () {
    expect(isNewerVersion('1.10.7', '1.10.7'), isFalse);
    expect(isNewerVersion('1.9.0', '1.10.0'), isFalse);
  });

  test('a build suffix and a short version are handled', () {
    expect(isNewerVersion('1.10.8', '1.10.7+17'), isTrue);
    expect(isNewerVersion('1.11', '1.10.9'), isTrue);
  });

  test('anything unparsable is never an update', () {
    expect(isNewerVersion('', '1.10.7'), isFalse);
    expect(isNewerVersion('latest', '1.10.7'), isFalse);
    expect(isNewerVersion('1.10.8', 'dev'), isFalse);
  });
}
