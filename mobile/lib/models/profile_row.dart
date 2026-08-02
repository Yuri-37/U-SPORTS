class ProfileRow {
  ProfileRow({
    required this.id,
    required this.role,
    this.fullName,
    this.email,
    this.avatarUrl,
    this.department,
    this.passwordChangedAt,
  });

  factory ProfileRow.fromJson(Map<String, dynamic> j) {
    return ProfileRow(
      id: j['id'] as String,
      role: j['role'] as String? ?? 'guest',
      fullName: j['full_name'] as String?,
      email: j['email'] as String?,
      avatarUrl: j['avatar_url'] as String?,
      department: j['department'] as String?,
      passwordChangedAt: j['password_changed_at'] as String?,
    );
  }

  final String id;
  final String role;
  final String? fullName;
  final String? email;
  final String? avatarUrl;
  final String? department;
  /// Null means the user has never used self-service change-password — i.e.
  /// they're still on whatever password was set for them at account creation.
  final String? passwordChangedAt;

  bool get isAthlete => role == 'athlete';
}

class AthleteRow {
  AthleteRow({
    required this.id,
    required this.profileId,
    required this.sport,
    this.position,
    this.jerseyNumber,
    this.yearLevel,
    this.department,
    this.studentId,
    this.seasonStatus,
  });

  factory AthleteRow.fromJson(Map<String, dynamic> j) {
    return AthleteRow(
      id: j['id'] as String,
      profileId: j['profile_id'] as String,
      sport: j['sport'] as String? ?? '',
      position: j['position'] as String?,
      jerseyNumber: j['jersey_number']?.toString(),
      yearLevel: j['year_level'] as String?,
      department: j['department'] as String?,
      studentId: j['student_id'] as String?,
      seasonStatus: j['season_status'] as String?,
    );
  }

  final String id;
  final String profileId;
  final String sport;
  final String? position;
  final String? jerseyNumber;
  final String? yearLevel;
  final String? department;
  final String? studentId;
  final String? seasonStatus;
}
