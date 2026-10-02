// Test cases executed on 24 September 2026. Every `shot` is a screenshot
// captured during that run and stored in docs/testing/screenshots.
//
// result: 'Pass' | 'Fail'
// Cases whose verification is a data-integrity check rather than a write are
// marked as such in `expected` so the scope of this cycle stays explicit.

const BY = 'Dacuba, Parco, Rodriguez'
const ON = '24 Sep 2026'

const tc = (id, description, steps, data, expected, shot, result = 'Pass', note = '') =>
  ({ id, description, steps, data, expected, shot, result, note, by: BY, on: ON })

export const webTests = [
  // --- 1. Public hub / guest browsing -------------------------------------
  tc('1-1', 'Verify that the public hub loads successfully with the correct elements.',
    ['Open the web application at its root address.', 'Confirm the navigation bar carries Hub, Rankings, Events and Sign In.', 'Confirm the live-game and season-total sections render.'],
    'N/A',
    ['The hub loads with no broken links or console errors.', 'Live game cards show the matches currently being played.', 'Season totals report athletes, teams, competitions and games played.'],
    'w01-guest-hub.png'),

  tc('1-2', 'Verify that a guest can read season rankings and leaderboards.',
    ['From the hub, open Rankings.', 'Select a sport and an academic year.', 'Read the player-statistics table.'],
    'Basketball, AY 2026-2027',
    ['The leaderboard lists ranked athletes with games played and the statistics that apply to the chosen sport.', 'Changing the sport or season re-filters the table.'],
    'w02-guest-standings.png'),

  tc('1-3', 'Verify that a guest can browse the events list.',
    ['From the hub, open Events.', 'Review the upcoming, ongoing and past groupings.'],
    'N/A',
    ['Every event is listed with its sport, format, season and status badge.'],
    'w03-guest-events.png'),

  tc('1-4', 'Verify that a guest can open an event and read its bracket.',
    ['From Events, open an ongoing event.', 'Review the bracket and the match list.'],
    'Basketball Championship Series',
    ['The bracket renders each round with live matches highlighted.', 'Match entries show participants, status and schedule.'],
    'w04-guest-event-detail.png'),

  tc('1-5', 'Verify that a guest can open a team page.',
    ['From Rankings or an event, open a team.', 'Review the record and roster.'],
    'Volleyball Team A',
    ['The team page shows the season record and the full roster.'],
    'w05-guest-team-detail.png'),

  tc('1-6', 'Verify that a guest can open an athlete profile.',
    ['From a roster or leaderboard, open an athlete.', 'Review the profile and season statistics.'],
    'Registered athlete',
    ['The profile shows department, year level, position and season statistics.'],
    'w06-guest-athlete-profile.png'),

  // --- 2. Authentication ---------------------------------------------------
  tc('2-1', 'Verify that the sign-in page loads successfully.',
    ['Open /auth/login.', 'Confirm the Email and Password fields and the Sign In button are present.'],
    'N/A',
    ['The sign-in page loads with both fields, a password visibility toggle, a Forgot password link and a guest link.'],
    'w08-login.png'),

  tc('2-2', 'Verify required-field validation on the sign-in page.',
    ['Open the sign-in page.', 'Leave the email and password fields empty.', 'Click Sign In.'],
    'Empty email and password',
    ['The system blocks the attempt and reports that the fields are required.', 'No request is sent and the user stays on the sign-in page.'],
    'w09-login-required-fields.png'),

  tc('2-3', 'Verify sign-in with invalid credentials.',
    ['Open the sign-in page.', 'Enter an unregistered email and an incorrect password.', 'Click Sign In.'],
    'wrong.user@nu-dasma.edu.ph / incorrect password',
    ['The system refuses the sign-in and displays "Invalid login credentials".', 'The user remains on the sign-in page and no session is created.'],
    'w10-login-invalid-credentials.png'),

  tc('2-4', 'Verify that the forgot-password page loads.',
    ['From the sign-in page, click Forgot password.'],
    'N/A',
    ['The reset request page loads with an email field and a send action.'],
    'w11-forgot-password.png'),

  tc('2-5', 'Verify the forgot-password request.',
    ['Open the forgot-password page.', 'Enter a registered school email address.', 'Submit the request.'],
    'Registered school email address',
    ['The system confirms that a reset link has been sent.', 'The wording does not reveal whether the account exists, so the form cannot be used to enumerate accounts.'],
    'w12-forgot-password-sent.png'),

  // --- 3. Data privacy -----------------------------------------------------
  tc('3-1', 'Verify that the data privacy notice blocks the application until it is answered.',
    ['Sign in with an account that has not yet accepted the notice.', 'Attempt to reach a dashboard.'],
    'Account with no recorded consent',
    ['The notice is shown full screen before any personal data.', 'It cannot be dismissed by clicking away; the user must accept or sign out.', 'Accepting records the consent and opens the dashboard.'],
    'w15-privacy-gate.png'),

  tc('3-2', 'Verify that the privacy notice is readable outside the sign-in flow.',
    ['Open /privacy-notice as a guest.'],
    'N/A',
    ['The full notice is readable without signing in.'],
    'w07-privacy-notice.png'),

  // --- 4. Super Admin ------------------------------------------------------
  tc('4-1', 'Verify that the Super Admin dashboard loads with its summary cards.',
    ['Sign in as a Super Admin.', 'Confirm the dashboard cards and side navigation render.'],
    'Super Admin account',
    ['The dashboard shows the key counts and the full administrator navigation.'],
    's01-sa-dashboard.png'),

  tc('4-2', 'Verify Super Admin staff account management.',
    ['Open Staff.', 'Review the staff list and the available actions.'],
    'Existing staff accounts',
    ['Organizers, Coaches and Super Admins are listed with Add staff, Add Super Admin, Edit, Deactivate and Reset password actions.'],
    's02-sa-staff.png'),

  tc('4-3', 'Verify Super Admin season management.',
    ['Open Seasons.', 'Review the seasons and their controls.'],
    'Existing seasons',
    ['Each academic-year season is listed with its status and New Season, Edit, Activate and Archive actions.'],
    's03-sa-seasons.png'),

  tc('4-4', 'Verify the school profile page.',
    ['Open School Profile.', 'Review the institution fields.'],
    'Current institution profile',
    ['Institution name, tagline, address, logo and brand colours are shown and editable.'],
    's04-sa-school-profile.png'),

  tc('4-5', 'Verify Super Admin account preferences.',
    ['Open Settings.', 'Review the profile, password and privacy controls.'],
    'Super Admin account',
    ['The page offers photo change, password update, Help Center, privacy notice and sign out.'],
    's05-sa-preferences.png'),

  tc('4-6', 'Verify the audit log.',
    ['Open Audit Logs.', 'Review the entries and paging controls.'],
    'Recorded administrator actions',
    ['Administrator and organizer actions are listed in order with working previous/next paging.'],
    's06-sa-audit-logs.png'),

  // --- 5. Organizer --------------------------------------------------------
  tc('5-1', 'Verify that the Organizer dashboard loads.',
    ['Sign in as an Organizer.', 'Review the dashboard cards and quick actions.'],
    'Organizer account (all sports)',
    ['The dashboard shows the season summary with Score Now, Jumbotron, New Event and management shortcuts.'],
    'o01-dashboard.png'),

  tc('5-2', 'Verify the event management list and its filters.',
    ['Open Events.', 'Switch between the Active, Completed, Cancelled and All filters.'],
    'Existing events',
    ['Events are listed with sport, season and status.', 'Each filter narrows the list and the count follows the filter.'],
    'o02-events.png'),

  tc('5-3', 'Verify the organizer event detail page.',
    ['Open an ongoing event from the list.', 'Review the bracket, matches and team tabs.'],
    'Basketball Championship Series',
    ['The event detail shows Bracket, Matches and Teams tabs with Edit details, Mark finished, Cancel event, Delete, Regenerate and Export PNG actions.'],
    'o03-event-detail.png'),

  tc('5-4', 'Verify athlete account management.',
    ['Open Athletes.', 'Review the list and the per-row actions.'],
    'Registered athletes',
    ['Athletes are listed with department, year level and status.', 'Add athlete, Import roster, Export CSV, Edit, Deactivate, Reset password and Delete are available.'],
    'o04-athletes.png'),

  tc('5-5', 'Verify team management.',
    ['Open Teams.', 'Review the teams, rosters and lineup controls.'],
    'Existing teams',
    ['Teams are listed by sport and department with Import teams, New Team, roster and starting-lineup controls.'],
    'o05-teams.png'),

  tc('5-6', 'Verify season management from the organizer shell.',
    ['Open Seasons.', 'Review the listed seasons.'],
    'Existing seasons',
    ['Seasons are listed with their status and date range.'],
    'o06-seasons.png'),

  tc('5-7', 'Verify the analytics module.',
    ['Open Analytics.', 'Switch between Leaderboard, Insights, Event results, Teams and Score Sheets.'],
    'Completed season data',
    ['Each tab renders its statistics for the selected sport and season, with Export CSV available.'],
    'o07-analytics.png'),

  tc('5-8', 'Verify the announcements module.',
    ['Open Announcements.', 'Review the posted announcements and the New Announcement action.'],
    'Posted announcements',
    ['Posted announcements are listed and a new one can be composed.'],
    'o08-announcements.png'),

  tc('5-9', 'Verify organizer account settings.',
    ['Open Settings.', 'Review the profile, password and privacy controls.'],
    'Organizer account',
    ['The page offers photo change, password update, Help Center, privacy notice and sign out.'],
    'o09-settings.png'),

  tc('5-10', 'Verify the notifications page.',
    ['Open Notifications.', 'Review the list and its filters.'],
    'Existing notifications',
    ['Notifications are listed with All, Unread and Recent filters plus Mark all read and Clear all.'],
    'o10-notifications.png'),

  tc('5-11', 'Verify the Help Center.',
    ['Open Help Center.', 'Review the guidance articles.'],
    'N/A',
    ['Role-specific guidance is presented and navigable.'],
    'o11-help-center.png'),

  // --- 6. Scoring ----------------------------------------------------------
  tc('6-1', 'Verify the live scoring screen and the scoring lock.',
    ['Open a live match from the dashboard or event.', 'Review the score controls, player chips and stat buttons.', 'Confirm the scoring-lock state is reported.'],
    'Live volleyball match (SBMA Spikers vs SECA Aces)',
    ['Both sides render with running score, set-by-set totals and per-player stat buttons.', 'Because another organizer holds the scoring lock, the screen reports Stat Tracker Mode and allows stat recording but not point awarding — so two organizers cannot award points at the same time.'],
    'o12-live-scoring.png'),

  tc('6-2', 'Verify the match review screen.',
    ['Open a completed match.', 'Review the result and box score.'],
    'Completed basketball match',
    ['The final result and per-player box score are shown with View Score Sheet, View Analytics and Edit stats actions.'],
    'o13-match-review.png'),

  tc('6-3', 'Verify the official score sheet.',
    ['From match review, open View Score Sheet.'],
    'Completed basketball match',
    ['The printable score sheet renders with both rosters and their recorded statistics.'],
    'o14-score-sheet.png'),

  tc('6-4', 'Verify the jumbotron scoreboard.',
    ['Open the jumbotron address for a live match.'],
    'Live match',
    ['The full-screen venue scoreboard renders with the live score and clock.'],
    'w13-jumbotron.png'),

  // --- 7. Coach ------------------------------------------------------------
  tc('7-1', 'Verify that a Coach sees a dashboard scoped to their own assignment.',
    ['Sign in as a Coach.', 'Review the dashboard and side navigation.'],
    'Coach account (SBMA Basketball)',
    ['The Coach lands on a dashboard offering Teams, Athletes and Analytics.', 'Administrator-only destinations (Staff, School Profile, Audit Logs) are absent from the navigation.'],
    'c01-coach-dashboard.png'),

  tc('7-2', 'Verify the Coach team view.',
    ['Open Teams as a Coach.'],
    'Coach account',
    ['Teams render with roster and lineup controls.'],
    'c02-coach-teams.png'),

  tc('7-3', 'Verify the Coach athlete view.',
    ['Open Athletes as a Coach.'],
    'Coach account',
    ['Athletes render for the sports the Coach is assigned to.'],
    'c03-coach-athletes.png'),

  tc('7-4', 'Verify the Coach event view.',
    ['Open Events as a Coach.'],
    'Coach account',
    ['Events render with the same filters available to an Organizer.'],
    'c04-coach-events.png'),

  tc('7-5', 'Verify Coach account settings.',
    ['Open Settings as a Coach.'],
    'Coach account',
    ['Profile, password, Help Center, privacy notice and sign out are available.'],
    'c05-coach-settings.png'),

  // --- 8. Athlete ----------------------------------------------------------
  tc('8-1', 'Verify the athlete dashboard.',
    ['Sign in as an Athlete.', 'Review the dashboard.'],
    'Athlete account',
    ['The dashboard shows the athlete’s live and past matches and their team roster.'],
    'a01-athlete-dashboard.png'),

  tc('8-2', 'Verify the athlete profile page.',
    ['Open My Profile.'],
    'Athlete account',
    ['The athlete’s own details and season statistics are shown.'],
    'a02-athlete-profile.png'),

  tc('8-3', 'Verify the athlete My Events page.',
    ['Open My Events as an Athlete whose team is entered in an ongoing event.'],
    'Athlete account entered in Basketball Championship Series',
    ['The page should list the events the athlete is participating in.', 'OBSERVED: the page always reports "No events yet". The underlying query requests a relationship between teams and event_participants that does not exist, so Supabase returns HTTP 400 (PGRST200) on every load. See Defect D-2.'],
    'a03-athlete-events.png', 'Fail',
    'Defect D-2 — open at the time of writing.'),

  tc('8-4', 'Verify athlete account settings.',
    ['Open Settings as an Athlete.'],
    'Athlete account',
    ['Password update, privacy notice and sign out are available.'],
    'a04-athlete-settings.png'),

  tc('8-5', 'Verify athlete notifications.',
    ['Open Notifications as an Athlete.'],
    'Existing notifications',
    ['Notifications are listed with their filters and bulk actions.'],
    'a05-athlete-notifications.png'),
]

export const mobileTests = [
  // --- 9. Guest browsing ---------------------------------------------------
  tc('9-1', 'Verify that the mobile home screen loads with the correct elements.',
    ['Install and open the Android application.', 'Review the banner, totals and bottom navigation.'],
    'N/A',
    ['The home screen shows the institution banner, game matches ongoing now, open events and the announcement ticker.', 'Bottom navigation offers Home, Rankings, Events and Sign in.'],
    'm04-home-guest.png'),

  tc('9-2', 'Verify mobile player statistics.',
    ['Open Rankings.', 'Choose a sport and season on the Player stats tab.'],
    'Basketball, AY 2026-2027',
    ['Ranked athletes are listed with games played and sport-appropriate statistics.'],
    'm05-standings.png'),

  tc('9-3', 'Verify mobile team rankings.',
    ['Open Rankings and switch to Team rankings.'],
    'Basketball, AY 2026-2027',
    ['Teams are ranked with wins, losses and win percentage.'],
    'm11-team-standings.png'),

  tc('9-4', 'Verify the mobile events list, search and sport filter.',
    ['Open Events.', 'Review the Upcoming & live and Past tabs and the sport filter.'],
    'Existing events',
    ['Events are listed with sport, format, season and status, and the sport filter narrows the list.'],
    'm06-events.png'),

  tc('9-5', 'Verify the mobile event bracket.',
    ['Open an ongoing event.', 'Review the Bracket tab.'],
    'Table Tennis Intramurals 2026',
    ['The bracket renders each round, with live matches highlighted and undecided slots shown as TBD.'],
    'm07-event-detail.png'),

  tc('9-6', 'Verify the mobile event match list.',
    ['On an event, switch to the Matches tab.'],
    'Table Tennis Intramurals 2026',
    ['Every match is listed with participants, status and schedule.'],
    'm08-event-matches.png'),

  tc('9-7', 'Verify the mobile live match view.',
    ['From the match list, open a live match.'],
    'Live table tennis match',
    ['A sheet opens showing the live score and both rosters.'],
    'm09-match-live.png'),

  tc('9-8', 'Verify the mobile team detail screen.',
    ['From team rankings, open a team.'],
    'SBMA Blazers',
    ['The team record and full roster render, with starters and jersey numbers marked.'],
    'm12-team-detail.png'),

  tc('9-9', 'Verify mobile settings as a guest.',
    ['Open Settings from the app bar while browsing as a guest.'],
    'N/A',
    ['Dark mode is offered and the account section invites the visitor to sign in.'],
    'm13-settings.png'),

  // --- 10. Mobile authentication -------------------------------------------
  tc('10-1', 'Verify that the mobile sign-in screen loads.',
    ['Tap Sign in on the bottom navigation.'],
    'N/A',
    ['The sign-in screen loads with Email and Password fields, a visibility toggle, Forgot password and a guest link.'],
    'm00-login.png'),

  tc('10-2', 'Verify mobile sign-in with invalid credentials.',
    ['Open the sign-in screen.', 'Enter a registered email with an incorrect password.', 'Tap Sign In.'],
    'Registered email / incorrect password',
    ['The app reports "Incorrect email or password." and no session is created.'],
    'm02-login-invalid.png'),

  tc('10-3', 'Verify the mobile forgot-password screen.',
    ['From sign-in, tap Forgot password.'],
    'N/A',
    ['The reset screen explains the process and offers an email field with Send reset link.'],
    'm03-forgot-password.png'),

  tc('10-4', 'Verify mobile sign-in with valid credentials.',
    ['Open the sign-in screen.', 'Enter a valid email and password.', 'Tap Sign In.'],
    'Valid coach credentials',
    ['The fields accept the input and the app authenticates and routes to the role’s home.'],
    'm14-login-valid.png'),

  tc('10-5', 'Verify the mobile data privacy notice gate.',
    ['Sign in with an account that has not yet accepted the notice.'],
    'Athlete account with no recorded consent',
    ['The notice is presented full screen before any personal data.', 'The user must accept or sign out; there is no way past it.'],
    'm19-privacy-gate.png'),

  tc('10-6', 'Verify the first-login password prompt.',
    ['Sign in with an account still using its issued first password.'],
    'Account that has never changed its password',
    ['The app prompts the user to change the password and offers Later or Change password.'],
    'm20-first-login-password-prompt.png'),

  // --- 11. Coach on mobile --------------------------------------------------
  tc('11-1', 'Verify the Coach My Teams screen.',
    ['Sign in as a Coach.', 'Open the My Teams tab.'],
    'Coach account',
    ['The screen renders its content — assigned teams with roster and starter counts, or, when none are assigned, the "No teams assigned yet" guidance.',
     'DEFECT FOUND AND FIXED during this cycle: the screen previously rendered as a blank grey panel under the app bar. Its body placed a Positioned widget (the offline banner) directly inside a Column, which is only valid inside a Stack; the resulting build error was drawn as the release-mode error widget. The duplicate banner was removed — it is already mounted application-wide — and the screen now renders. See Defect D-1.'],
    'm15-coach-my-teams.png', 'Pass',
    'Re-tested after the fix. Defect D-1 — closed.'),

  tc('11-2', 'Verify Coach settings on mobile.',
    ['Open Settings from the My Teams app bar.'],
    'Coach account',
    ['Appearance, Change password, Privacy notice and Sign out are offered.', 'The password rules match the web application.'],
    'm17-coach-settings.png'),

  tc('11-3', 'Verify that the privacy notice can be re-read from settings.',
    ['In Settings, open Privacy notice.'],
    'Signed-in account',
    ['The full notice is shown again on demand.'],
    'm18-privacy-notice.png'),

  // --- 12. Athlete on mobile ------------------------------------------------
  tc('12-1', 'Verify the mobile home screen for a signed-in athlete.',
    ['Sign in as an Athlete.', 'Review the home screen.'],
    'Athlete account',
    ['The home screen adds a shortcut to the athlete dashboard and an unread notification badge.', 'Bottom navigation shows Profile in place of Sign in.'],
    'm16-home-athlete.png'),

  tc('12-2', 'Verify the mobile athlete dashboard.',
    ['Open the Profile tab as an Athlete.'],
    'Athlete account (2023-170000)',
    ['The dashboard shows school ID, department, year level, position and jersey number.', 'The season snapshot reports games played and per-game statistics, followed by upcoming and live matches.'],
    'm21-athlete-dashboard.png'),

  tc('12-3', 'Verify mobile notifications.',
    ['Tap the notification bell.'],
    'Unread notifications',
    ['Notifications are listed with All, Unread and Recent filters, plus Read all and clear actions.'],
    'm22-notifications.png'),
]
