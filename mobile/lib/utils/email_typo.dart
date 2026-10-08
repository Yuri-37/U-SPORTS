/// Catches a mistyped school email domain before a reset is requested.
///
/// Mirrors apps/web/src/lib/emailTypo.ts. A reset for an address with no
/// account still "succeeds" (on purpose, so the form does not reveal who has
/// an account), so a typo such as `@sudents.nu-dasma.edu.ph` silently sends
/// nothing and looks exactly like a slow email.
const _schoolDomains = ['students.nu-dasma.edu.ph', 'nu-dasma.edu.ph'];

int _editDistance(String a, String b) {
  final dp = List.generate(a.length + 1, (i) => List<int>.filled(b.length + 1, 0));
  for (var i = 0; i <= a.length; i++) {
    dp[i][0] = i;
  }
  for (var j = 0; j <= b.length; j++) {
    dp[0][j] = j;
  }
  for (var i = 1; i <= a.length; i++) {
    for (var j = 1; j <= b.length; j++) {
      final cost = a[i - 1] == b[j - 1] ? 0 : 1;
      final del = dp[i - 1][j] + 1;
      final ins = dp[i][j - 1] + 1;
      final sub = dp[i - 1][j - 1] + cost;
      dp[i][j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
  }
  return dp[a.length][b.length];
}

/// The corrected address, or null when the domain is fine or nowhere near a
/// school one.
String? suggestSchoolEmail(String email) {
  final trimmed = email.trim();
  final at = trimmed.lastIndexOf('@');
  if (at < 1) return null;
  final local = trimmed.substring(0, at);
  final domain = trimmed.substring(at + 1).toLowerCase();
  if (_schoolDomains.contains(domain)) return null;
  String? best;
  var bestDist = 99;
  for (final d in _schoolDomains) {
    final dist = _editDistance(domain, d);
    if (dist <= 3 && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best == null ? null : '$local@$best';
}
