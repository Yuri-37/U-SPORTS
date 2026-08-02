import '../config/env.dart';

/// Turn stored `institution.logo_url` into a loadable absolute URL.
/// If the stored URL points at 127.0.0.1 or localhost it won't be reachable
/// from a physical device, so we rewrite the host to match Env.supabaseUrl.
String? resolveInstitutionLogoUrl(String? raw) {
  if (raw == null) return null;
  final t = raw.trim();
  if (t.isEmpty) return null;
  if (t.startsWith('//')) return 'https:$t';

  final base = Env.supabaseUrl.replaceAll(RegExp(r'/+$'), '');

  if (t.startsWith('http://') || t.startsWith('https://')) {
    // Replace 127.0.0.1 / localhost with the configured Supabase host so the
    // image is reachable from a physical device on the same network.
    if (base.isNotEmpty) {
      final baseUri = Uri.tryParse(base);
      final imgUri = Uri.tryParse(t);
      if (baseUri != null && imgUri != null) {
        final isLocal = imgUri.host == '127.0.0.1' || imgUri.host == 'localhost';
        if (isLocal && baseUri.host != imgUri.host) {
          return imgUri.replace(host: baseUri.host, port: baseUri.port).toString();
        }
      }
    }
    return t;
  }

  if (base.isEmpty) return null;
  if (t.startsWith('/')) return '$base$t';
  return '$base/$t';
}
