import 'package:flutter_test/flutter_test.dart';
import 'package:u_sports_mobile/widgets/download_data_tile.dart';

void main() {
  test('the export file is named like the website download', () {
    expect(myDataFileName(DateTime(2026, 10, 11, 8, 30)), 'u-sports-my-data-2026-10-11.json');
  });
}
