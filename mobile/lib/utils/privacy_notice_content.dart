/// Original content, not National University's own privacy notice — U-Sports
/// is an independent, unofficial student-built platform, not one of NU
/// Dasmariñas's registered information systems. Scoped strictly to what this
/// app actually collects (verified against the schema, not guessed) — no
/// document/COR-upload language, since that feature was built twice and
/// abandoned both times. RA 10173 is cited only as the applicable law, never
/// as a registration/certification claim.
///
/// Mirrors apps/web/src/lib/privacyNotice.ts — keep both in sync.
class PrivacyNoticeSection {
  const PrivacyNoticeSection(this.heading, this.body);
  final String heading;
  final String body;
}

const List<PrivacyNoticeSection> kPrivacyNoticeSections = [
  PrivacyNoticeSection(
    '',
    "U-Sports is a companion app built by and for NU Dasmariñas students to "
        "run intramural sports — team rosters, schedules, live scoring, and "
        "standings. It is an independent, unofficial platform, not one of NU "
        "Dasmariñas's official information systems. Before you continue, "
        "here's what we collect and how we use it.",
  ),
  PrivacyNoticeSection(
    'What we collect',
    "Your name, NU Dasmariñas email address, and profile photo (if you add "
        "one); your role and department; if you're an athlete: student ID, "
        "sport, position, jersey number, year level, and season status; if "
        "you're an organizer or coach: your assigned sports and teams; game "
        "activity tied to your name (stats recorded during matches, team "
        "roster membership); a device notification token (not your device "
        "model, IP address, or advertising ID); a record of "
        "organizer/administrator actions (audit log), for accountability.",
  ),
  PrivacyNoticeSection(
    'Why',
    'Solely to run intramural sports: rosters, scheduling, live scoring, '
        'standings, and notifications about your team.',
  ),
  PrivacyNoticeSection(
    'Who can see it',
    "Organizers/coaches assigned to your sport and platform administrators, "
        "to manage your team and events. Once an event is completed, its "
        "rosters and stats become visible to the public on U-Sports, the "
        "same way a printed results sheet would be — matching how completed "
        "events are already shown to anyone browsing without an account. We "
        "don't sell or share your data outside U-Sports.",
  ),
  PrivacyNoticeSection(
    'How long',
    'For as long as your account exists, and afterward as historical season '
        'records.',
  ),
  PrivacyNoticeSection(
    'The law behind this',
    'The Data Privacy Act of 2012 (RA 10173) governs how personal '
        'information must be handled in the Philippines, and applies to how '
        'U-Sports handles yours. This notice describes our own practices — '
        'it is not a claim that U-Sports is registered or certified by the '
        'National Privacy Commission.',
  ),
  PrivacyNoticeSection(
    'Questions?',
    "Contact your sport's organizer or a platform administrator.",
  ),
  PrivacyNoticeSection(
    '',
    'By tapping "I Agree — Continue," you confirm you\'ve read this notice '
        'and agree to U-Sports collecting and using your information as '
        'described.',
  ),
];
