import type { TourDefinition } from './types'
import {
  A_COACH_STATS,
  A_COACH_TEAMS,
  A_COACH_QUICK_ACTIONS,
  A_ATHLETES_ADD,
  A_ATHLETES_IMPORT,
  A_TEAMS_ROSTER,
  A_ANALYTICS_ROOT,
  navAnchor,
} from './anchors'

// Follows the professor's own diagram: season -> join a sport -> Teams (by
// department) -> upload the roster. No Events, Announcements, or Scoring —
// coaches don't have those nav entries and are hard-blocked from live
// scoring entirely.
export const coachTour: TourDefinition = {
  id: 'coach',
  version: 1,
  label: 'Coach: manage your team',
  description: "Your season, your roster, and where your team's stats show up.",
  roles: ['Coach'],
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to U-Sports',
      body: "A quick tour of what you'll actually use: your assigned season and sport, your team's roster, and where their stats show up.",
    },
    {
      id: 'stats',
      route: '/organizer',
      target: A_COACH_STATS,
      title: 'Your team at a glance',
      body: 'Your teams, athletes, and live matches — scoped to the department and sport you were assigned.',
    },
    {
      id: 'seasons-nav',
      route: '/organizer/seasons',
      target: navAnchor('/organizer/seasons'),
      title: 'Your seasons',
      body: 'The seasons your Super Admin assigned you to — read-only here, this is where you confirm you actually have access before setting up a roster.',
      interactive: true,
    },
    {
      id: 'my-teams',
      route: '/organizer',
      target: A_COACH_TEAMS,
      title: 'My teams',
      body: 'Your assigned teams live here on your dashboard — click one to jump straight to its roster.',
    },
    {
      id: 'athletes-nav',
      route: '/organizer/athletes',
      target: navAnchor('/organizer/athletes'),
      title: 'Athletes',
      body: 'Add an athlete one at a time, or import a whole roster from a spreadsheet — both send an email invite to set up their account.',
      interactive: true,
    },
    {
      id: 'athletes-add',
      target: [A_ATHLETES_ADD, A_ATHLETES_IMPORT],
      title: 'Add or import your roster',
      required: false,
      interactive: true,
      body: 'This is the fastest way to get a full team into the system at once.',
    },
    {
      id: 'teams-nav',
      route: '/organizer/teams',
      target: navAnchor('/organizer/teams'),
      title: 'Teams',
      body: "Open your team, then Edit to manage the roster — who's active, jersey numbers, and lineup slots.",
      interactive: true,
    },
    {
      id: 'roster',
      target: A_TEAMS_ROSTER,
      title: 'Active lineup & jersey numbers',
      required: false, // only in the DOM if the coach opened a team's Edit modal
      interactive: true,
      body: "Each sport has its own active-slot cap — you'll see it right here as you assign players. Jersey numbers must be unique within the team.",
    },
    {
      id: 'analytics-nav',
      route: '/organizer/analytics',
      target: navAnchor('/organizer/analytics'),
      title: 'Analytics',
      body: "Your team's stats and trends update automatically as matches are scored — no extra step from you.",
      interactive: true,
    },
    {
      id: 'analytics-root',
      target: A_ANALYTICS_ROOT,
      title: 'Trends and leaderboards',
      interactive: true,
      body: 'Filter to your sport to see how your athletes are trending recently versus their season average.',
    },
    {
      id: 'quick-actions',
      route: '/organizer',
      target: A_COACH_QUICK_ACTIONS,
      title: 'Quick actions',
      body: 'Teams, Athletes, and Analytics — the three you touch most — one tap away from your dashboard.',
    },
    {
      id: 'done',
      title: "That's everything",
      body: 'Season access → roster → jersey numbers and lineups → Analytics tracks the rest. Replay this any time from Settings → Help Center.',
    },
  ],
}
