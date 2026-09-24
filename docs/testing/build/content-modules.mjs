// Module / function inventory for the U-Sports functionality testing tables.
// Derived from apps/web/src/router.tsx, apps/server/src/routes and mobile/lib.

export const generalModules = [
  ['1', 'Login / Authentication', [
    ['Authenticate', 'Verifies the email and password against Supabase Auth and routes the user to the dashboard that matches their role (Super Admin, Organizer, Coach or Athlete).'],
    ['Forgot Password', 'Sends a password-reset link to a registered school email address and reports the outcome without revealing whether the account exists.'],
    ['Accept Invite / Set First Password', 'Lets an invited staff member or athlete set their own password from the link sent to their school email.'],
    ['Guest Access', 'Allows anyone to browse standings, events and rosters without signing in.'],
  ]],
  ['2', 'Data Privacy Notice', [
    ['Review Notice', 'Presents what the platform collects and why, before any personal data is shown.'],
    ['Accept Notice', 'Records the consent timestamp and unblocks the rest of the application; the notice cannot be dismissed without a decision.'],
  ]],
  ['3', 'Profile', [
    ['View Profile', 'Displays the signed-in user’s own details — name, school ID, department, year level, position and jersey number.'],
    ['Edit Profile', 'Updates the user’s own personal details and profile photo.'],
    ['Change Password', 'Updates the account password, subject to the once-every-7-days limit and the 8-character / letter-and-number rule.'],
  ]],
  ['4', 'Notifications', [
    ['View Notifications', 'Lists announcements and match alerts addressed to the user, with an unread badge and All / Unread / Recent filters.'],
    ['Mark Read and Clear', 'Marks notifications as read individually or all at once, and removes them from the list.'],
  ]],
  ['5', 'Sign Out', [
    ['Logout Function', 'Ends the session on the device and returns the user to the public hub, leaving no session open.'],
  ]],
]

export const webModules = [
  ['1', 'Public Hub (Landing Page)', [
    ['Introduction and Navigation', 'Presents the institution banner, live games, open events, sports and season totals, with navigation to Hub, Standings, Events and Sign In.'],
    ['Live Game Cards', 'Shows each match currently being played with running scores, refreshed in real time.'],
  ]],
  ['2', 'Guest — Standings', [
    ['View Player Statistics', 'Season leaderboard per sport, with the statistics that apply to that sport (PPG/RPG/APG for basketball, attacks/aces for volleyball, points/winners for table tennis).'],
    ['View Team Standings', 'Win-loss record and win percentage per team for the selected sport and season.'],
    ['Filter by Sport and Season', 'Restricts both tables to a chosen sport and academic year.'],
  ]],
  ['3', 'Guest — Events', [
    ['Browse Events', 'Lists upcoming, ongoing and past events with a search box and sport filter.'],
    ['View Event Detail', 'Shows the event bracket and its match list with status and schedule.'],
  ]],
  ['4', 'Guest — Team and Athlete Profiles', [
    ['View Team Detail', 'Shows a team’s season record and full roster with jersey numbers and positions.'],
    ['View Athlete Profile', 'Shows an athlete’s department, year level, position and season statistics.'],
  ]],
  ['5', 'Jumbotron', [
    ['Display Live Scoreboard', 'Full-screen venue scoreboard for a single match, driven by the live scoring session.'],
  ]],
  ['6', 'Super Admin and Organizer — Dashboard', [
    ['Data Visualization Cards', 'Summarises athletes, teams, events and games played as cards, with quick actions into scoring and management.'],
  ]],
  ['7', 'Organizer — Event Management', [
    ['View Events', 'Lists every event the organizer may manage, filtered by Active, Completed, Cancelled or All.'],
    ['Search and Filter Events', 'Narrows the list by name, category, sport or status and reports the filtered count.'],
    ['Create Event', 'Registers a new event under a season, sport and category.'],
    ['Edit Event Details', 'Updates the name, schedule, format and category of an existing event.'],
    ['Generate Bracket', 'Builds the single- or double-elimination bracket from the registered participants.'],
    ['Mark Finished / Cancel / Delete Event', 'Closes, cancels or removes an event and its dependent records.'],
    ['Export Bracket', 'Saves the rendered bracket as an image for posting.'],
  ]],
  ['8', 'Organizer — Live Scoring', [
    ['Record Team Score', 'Adds or subtracts points, sets or games for either side while the match is live.'],
    ['Record Player Statistics', 'Attributes each scoring action to a player on the active lineup.'],
    ['Scoring Lock / Stat Tracker Mode', 'Gives one organizer the scoring lock and puts any other organizer in stat-tracker mode, so two people cannot award points at once.'],
    ['Validate Set / Advance Period', 'Freezes the current set or quarter so it can no longer be edited, then advances play.'],
  ]],
  ['9', 'Organizer — Match Review and Score Sheet', [
    ['View Match Review', 'Shows the finalised result, per-player box score and the organizer who recorded it.'],
    ['Edit Stats', 'Corrects recorded statistics after a match is finalised.'],
    ['View and Export Score Sheet', 'Produces the printable official score sheet for the match.'],
  ]],
  ['10', 'Organizer and Coach — Team Management', [
    ['View Teams', 'Lists teams for the sports and season the user is assigned to.'],
    ['Create Team', 'Registers a new team under a sport, department and season.'],
    ['Import Teams', 'Creates several teams at once from a CSV or Excel file.'],
    ['Manage Roster', 'Adds or removes athletes and sets jersey numbers and positions.'],
    ['Set Starting Lineup', 'Marks which roster members start, in slot order.'],
  ]],
  ['11', 'Organizer and Coach — Athlete Accounts', [
    ['Add Athlete', 'Registers one athlete with a school ID, real school email, department, year level and sport.'],
    ['Import Roster', 'Registers many athletes from a CSV or Excel file, rejecting and naming any row with an invalid year level or email.'],
    ['View Athlete Accounts', 'Lists registered athletes with their status, filterable by Activated or Deactivated.'],
    ['Edit Athlete Account', 'Updates an athlete’s details, position and jersey number.'],
    ['Deactivate / Delete Athlete', 'Suspends or permanently removes an athlete account.'],
    ['Reset Athlete Password', 'Issues a fresh first password for an athlete who cannot sign in.'],
    ['Export CSV', 'Downloads the athlete list for offline records.'],
  ]],
  ['12', 'Organizer — Season Management', [
    ['View Seasons', 'Lists academic-year seasons with their status.'],
    ['Create Season', 'Opens a new academic-year season together with its starter teams and events per sport.'],
    ['Activate / Archive Season', 'Marks which season is current, or closes a finished one.'],
  ]],
  ['13', 'Organizer — Analytics', [
    ['View Leaderboard and Insights', 'Season-wide statistical rankings and derived insights per sport.'],
    ['View Event Results', 'Final placements and results per event.'],
    ['Export CSV', 'Downloads the analytics tables for reporting.'],
  ]],
  ['14', 'Organizer and Super Admin — Announcements', [
    ['Create Announcement', 'Composes an announcement with a title, body and display type.'],
    ['Post Announcement', 'Publishes it to the hub ticker and to the notification lists of the intended audience.'],
    ['View Announcements', 'Lists posted announcements for review.'],
  ]],
  ['15', 'Super Admin — Staff Accounts', [
    ['Add Staff', 'Creates an Organizer or Coach account against a school email address.'],
    ['Add Super Admin', 'Creates another administrator account.'],
    ['Assign Department and Sports', 'Scopes what a staff member may manage, by department, sport and season.'],
    ['Edit / Deactivate / Reset Password', 'Maintains existing staff accounts.'],
  ]],
  ['16', 'Super Admin — School Profile', [
    ['Edit Institution Profile', 'Sets the institution name, tagline, address, logo and brand colours used across both apps.'],
  ]],
  ['17', 'Super Admin — Audit Logs', [
    ['View Audit Trail', 'Lists administrator and organizer actions in order, paginated, for accountability.'],
  ]],
  ['18', 'Help Center', [
    ['View Help Articles', 'In-app guidance for each role on how to run a season.'],
  ]],
]

export const mobileModules = [
  ['1', 'Home', [
    ['Access Services', 'Shows the institution banner, games being played now, open-event totals and the announcement ticker, and routes to every other section.'],
  ]],
  ['2', 'Standings and Leaderboards', [
    ['View Player Statistics', 'Season leaderboard per sport with sport-appropriate statistics.'],
    ['View Team Standings', 'Win-loss record and win percentage per team.'],
    ['Filter by Sport and Season', 'Restricts the tables to a chosen sport and academic year.'],
  ]],
  ['3', 'Events', [
    ['Browse Events', 'Upcoming, live and past events with search and sport filter.'],
    ['View Bracket', 'Renders the event bracket with live matches highlighted.'],
    ['View Matches', 'Lists the event’s matches with status and schedule.'],
  ]],
  ['4', 'Live Match View', [
    ['View Live Score and Roster', 'Opens a live match as a sheet showing the running score and both rosters.'],
  ]],
  ['5', 'Team Detail', [
    ['View Record and Roster', 'Team season record with the full roster, starters marked.'],
  ]],
  ['6', 'Coach — My Teams', [
    ['View Assigned Teams', 'Lists the teams the signed-in coach is assigned to, with roster and starter counts.'],
    ['View Schedule and Results', 'Shows what is being played now, what is next, and recent results for those teams.'],
    ['Courtside Roster Edit', 'Lets a coach adjust jersey number, position and starting lineup from the team page.'],
  ]],
  ['7', 'Athlete — Dashboard', [
    ['View Own Profile and Stats', 'School ID, department, year level, position, jersey number and the season snapshot.'],
    ['View Own Schedule', 'Upcoming and live matches for the athlete’s team.'],
  ]],
  ['8', 'Notifications', [
    ['View Notifications', 'Announcements and match alerts with an unread badge and All / Unread / Recent filters.'],
    ['Read All and Clear', 'Marks everything read or clears the list.'],
  ]],
  ['9', 'Settings', [
    ['Toggle Dark Mode', 'Switches the app between light and dark appearance.'],
    ['Change Password', 'Updates the account password from the device.'],
    ['View Privacy Notice', 'Re-opens the data privacy notice at any time.'],
    ['Sign Out', 'Ends the session on the device.'],
  ]],
]
