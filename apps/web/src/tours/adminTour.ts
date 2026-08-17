import React from 'react'
import type { TourDefinition } from './types'
import {
  A_ADMIN_STATS,
  A_ADMIN_ACTIONS,
  A_SEASONS_NEW,
  A_SEASONS_SPORTS,
  A_SEASONS_STAFF,
  A_STAFF_ADD,
  navAnchor,
} from './anchors'
import PlaceholderGeneratorStep from '../components/tour/steps/PlaceholderGeneratorStep'

export const adminTour: TourDefinition = {
  id: 'admin',
  version: 1,
  label: 'Super Admin: set up a season',
  description: 'Assign staff, choose sports, and generate a starting roster of teams and events.',
  roles: ['Admin'],
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to U-Sports',
      body: "This is a quick walkthrough of the two things you'll do before handing off to your Organizers and Coaches: assign staff to a season, and choose which sports run. Skip any time.",
    },
    {
      id: 'stats',
      route: '/super-admin',
      target: A_ADMIN_STATS,
      title: 'Your platform at a glance',
      body: 'Active athletes, live events, and the current season — the numbers that matter day to day.',
      waitMs: 6000, // StatCards replace a loading skeleton once /admin/stats resolves
    },
    {
      id: 'admin-actions',
      target: A_ADMIN_ACTIONS,
      title: 'Shortcuts',
      body: 'Everything below also lives in the sidebar — this is just the fast path to the things you touch most often.',
    },
    {
      id: 'staff-nav',
      route: '/super-admin/organizers',
      target: navAnchor('/super-admin/organizers'),
      title: 'Staff',
      body: 'Organizers and Coaches sign in here. You add them from this page and decide which seasons they can configure.',
      interactive: true,
    },
    {
      id: 'staff-add',
      target: A_STAFF_ADD,
      title: 'Add staff',
      body: 'Assign a sport, and — if they\'re a Coach — a department. They\'ll get an email invite to set their own password.',
      interactive: true,
    },
    {
      id: 'seasons-nav',
      route: '/super-admin/seasons',
      target: navAnchor('/super-admin/seasons'),
      title: 'Seasons',
      body: 'Everything else in U-Sports scopes to a season — sports, teams, events. Start here for each new term.',
      interactive: true,
    },
    {
      id: 'seasons-new',
      target: A_SEASONS_NEW,
      title: 'Create a season',
      body: 'Give it a name and its date range — the range must be in the future to start.',
      interactive: true,
    },
    {
      id: 'seasons-sports',
      target: A_SEASONS_SPORTS,
      title: 'Choose the sports',
      body: 'Only sports checked here appear in every Event/Team form for this season — narrows the dropdowns for everyone downstream.',
      required: false, // only reachable if the admin actually opened the Create Season modal
      interactive: true,
    },
    {
      id: 'seasons-staff',
      target: A_SEASONS_STAFF,
      title: 'Assign the organizing team',
      body: "This is where the professor's own sketch put it: assign your Organizers and Coaches to the season before it starts. Leave everyone unchecked to assign every current staff account by default.",
      required: false,
      interactive: true,
    },
    {
      id: 'generator',
      title: 'Give them a starting point',
      size: 'lg',
      render: (ctx) => React.createElement(PlaceholderGeneratorStep, { ctx }),
    },
    {
      id: 'handoff',
      title: "You're set up",
      body: 'This detailed setup is the responsibility of the Organizer and Coach. You can leave this to them or complete it yourself.',
    },
  ],
}
