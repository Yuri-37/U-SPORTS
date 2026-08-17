import type { StaffRole } from '../tours/types'

export interface ManualSection {
  heading: string
  body: string
}

/** Same shape/rendering convention as PRIVACY_NOTICE_SECTIONS — one loop,
 *  content lives in data rather than JSX so it's easy to keep accurate as
 *  the app changes. Keyed by staff role; deliberately short — this is a
 *  quick reference, not a full manual, and the guided tour covers the
 *  step-by-step walkthrough. */
export const STAFF_MANUAL_SECTIONS: Record<StaffRole, ManualSection[]> = {
  Admin: [
    {
      heading: 'What you can do',
      body: 'Create and configure seasons, choose which sports run in each one, add and manage staff accounts (Organizers and Coaches), and see the full platform overview. Everything else — athletes, teams, events, live scoring — you can also do, but day to day it belongs to your Organizers and Coaches.',
    },
    {
      heading: 'The order that works',
      body: 'Create a season → choose its sports → assign staff to it. Every Event and Team form narrows to whatever a season actually carries, so getting this order right up front saves everyone downstream from picking the wrong sport.',
    },
    {
      heading: 'Staff accounts',
      body: "A Coach is scoped to exactly one sport and one department — the system won't let two Coach accounts hold the same sport in the same department. An Organizer can be scoped to multiple sports. New staff get an email invite to set their own password.",
    },
    {
      heading: 'Common gotcha',
      body: "A newly created season has no sports and no staff until you set them — an empty season looks the same as a working one until someone tries to create a team or event in it and finds the dropdowns empty.",
    },
  ],
  Organizer: [
    {
      heading: 'What you can do',
      body: 'Add athletes, create and manage teams, create events and generate brackets, run live scoring, and post announcements — scoped to whichever sports and seasons your Super Admin assigned you.',
    },
    {
      heading: 'Roster limits',
      body: 'Max roster size: Basketball 15, Volleyball 12, Table Tennis 8. Active lineup: Basketball 5, Volleyball 6, Table Tennis 1 per match (2 if a team is entered in both singles and doubles). Jersey numbers must be unique within a team.',
    },
    {
      heading: 'One team per sport per season',
      body: 'An athlete can only be on one team for a given sport in a given season — adding them to a second team for the same sport and season is blocked.',
    },
    {
      heading: 'Season scoping',
      body: "Every Team and Event form asks for a season first, then narrows the sport list to whatever that season actually carries. If a sport you expect isn't in the list, it hasn't been enabled for that season — check with your Super Admin.",
    },
  ],
  Coach: [
    {
      heading: 'What you can do',
      body: "Manage the roster for your assigned teams — add athletes, set jersey numbers, and choose the active lineup. You're scoped to one sport and one department.",
    },
    {
      heading: 'Roster limits',
      body: 'Max roster size: Basketball 15, Volleyball 12, Table Tennis 8. Active lineup: Basketball 5, Volleyball 6, Table Tennis 1 per match (2 if your team is entered in both singles and doubles). Jersey numbers must be unique within your team.',
    },
    {
      heading: "What you can't do",
      body: "Creating events and running live scoring are an Organizer's job — you won't see those in your navigation. If a match needs to be scored, ask your Organizer.",
    },
    {
      heading: 'Adding your roster',
      body: 'Add athletes one at a time from the Athletes page, or import a whole roster from a spreadsheet — both send the athlete an email invite to set up their own account.',
    },
  ],
}
