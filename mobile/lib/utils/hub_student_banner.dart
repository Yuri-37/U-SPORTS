import 'package:shared_preferences/shared_preferences.dart';

const _prefix = 'usports.hub.studentBanner.';

enum HubStudentBannerKind { unverified, verified }

Future<bool> isHubStudentBannerDismissed(String userId, HubStudentBannerKind kind) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString('$_prefix$userId.${kind.name}') == '1';
}

Future<void> dismissHubStudentBanner(String userId, HubStudentBannerKind kind) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('$_prefix$userId.${kind.name}', '1');
}
