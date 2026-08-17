/**
 * Every tour target lives here as a named constant so a typo becomes a
 * TypeScript error instead of a silently-missed step that falls back to a
 * centered card. `data-tour` values are added to the source components as
 * each tour is built.
 */

/** Matches the `data-tour={`nav-${item.to}`}` attribute on every Sidebar NavLink. */
export function navAnchor(to: string): string {
  return `[data-tour="nav-${to}"]`
}

// ─── Super Admin dashboard ──────────────────────────────────────────────────
export const A_ADMIN_STATS = '[data-tour="admin-stats"]'
export const A_ADMIN_ACTIONS = '[data-tour="admin-actions"]'

// ─── Seasons (Super Admin) ──────────────────────────────────────────────────
export const A_SEASONS_NEW = '[data-tour="seasons-new"]'
export const A_SEASONS_SPORTS = '[data-tour="seasons-sports"]'
export const A_SEASONS_STAFF = '[data-tour="seasons-staff"]'
export const A_SEASONS_CREATE_SUBMIT = '[data-tour="seasons-create-submit"]'

// ─── Staff (Super Admin → Organizers) ───────────────────────────────────────
export const A_STAFF_ADD = '[data-tour="staff-add"]'

// ─── Organizer dashboard ────────────────────────────────────────────────────
export const A_ORG_STATS = '[data-tour="org-stats"]'
export const A_ORG_QUICK_ACTIONS = '[data-tour="org-quick-actions"]'
export const A_ORG_LIVE_PANEL = '[data-tour="org-live-panel"]'

// ─── Coach dashboard (same file, different DOM branch — distinct values) ───
export const A_COACH_STATS = '[data-tour="coach-stats"]'
export const A_COACH_TEAMS = '[data-tour="coach-teams"]'
export const A_COACH_QUICK_ACTIONS = '[data-tour="coach-quick-actions"]'

// ─── Athletes ────────────────────────────────────────────────────────────
export const A_ATHLETES_ADD = '[data-tour="athletes-add"]'
export const A_ATHLETES_IMPORT = '[data-tour="athletes-import"]'

// ─── Teams ───────────────────────────────────────────────────────────────
export const A_TEAMS_CREATE_HEADER = '[data-tour="teams-create-header"]'
export const A_TEAMS_CREATE_EMPTY = '[data-tour="teams-create-empty"]'
export const A_TEAMS_ROSTER = '[data-tour="teams-roster"]'

// ─── Events ──────────────────────────────────────────────────────────────
export const A_EVENTS_CREATE_HEADER = '[data-tour="events-create-header"]'
export const A_EVENTS_CREATE_EMPTY = '[data-tour="events-create-empty"]'
export const A_CREATE_EVENT_MODAL = '[data-tour="create-event-modal"]'

// ─── Scoring / Analytics / Announcements ───────────────────────────────────
export const A_ANALYTICS_ROOT = '[data-tour="analytics-root"]'
export const A_ANNOUNCEMENTS_NEW = '[data-tour="announcements-new"]'
