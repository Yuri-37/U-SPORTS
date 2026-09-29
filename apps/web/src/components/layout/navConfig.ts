import {
  LayoutDashboard,
  Users,
  Calendar,
  BarChart3,
  Settings,
  Megaphone,
  Trophy,
  ClipboardList,
  User,
  Globe,
  Dumbbell,
  UserCheck,
  Building2,
  HelpCircle,
  Bell,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean }

// Exported so tours/index.ts can assert every `nav-*` tour target actually
// exists in the role's real nav — otherwise editing one of these arrays can
// silently strand a tour step on its centered fallback with no obvious cause.
export const superAdminNav: NavItem[] = [
  { to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/super-admin/organizers', label: 'Staff', icon: Users },
  { to: '/super-admin/seasons', label: 'Seasons', icon: Calendar },
  { to: '/organizer/athletes', label: 'Athletes', icon: UserCheck },
  { to: '/organizer/events', label: 'Events', icon: Trophy },
  { to: '/organizer/teams', label: 'Teams', icon: Dumbbell },
  { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/organizer/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/super-admin/settings', label: 'School Profile', icon: Building2 },
  { to: '/super-admin/preferences', label: 'Settings', icon: Settings },
  { to: '/super-admin/audit', label: 'Audit Logs', icon: ClipboardList },
  { to: '/help', label: 'Help Center', icon: HelpCircle },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
]

export const organizerNav: NavItem[] = [
  { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
  { to: '/organizer/seasons', label: 'Seasons', icon: Calendar },
  { to: '/organizer/athletes', label: 'Athletes', icon: UserCheck },
  { to: '/organizer/events', label: 'Events', icon: Trophy },
  { to: '/organizer/teams', label: 'Teams', icon: Dumbbell },
  { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/organizer/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/organizer/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help Center', icon: HelpCircle },
]

export const coachNav: NavItem[] = [
  { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
  { to: '/organizer/seasons', label: 'Seasons', icon: Calendar },
  { to: '/organizer/athletes', label: 'Athletes', icon: UserCheck },
  { to: '/organizer/teams', label: 'Teams', icon: Dumbbell },
  { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/organizer/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help Center', icon: HelpCircle },
]

export const athleteNav: NavItem[] = [
  { to: '/athlete', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/athlete/profile', label: 'My Profile', icon: User },
  { to: '/athlete/settings', label: 'Settings', icon: Settings, exact: true },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
]

export function navForRole(role: string | undefined): NavItem[] {
  if (role === 'Admin') return superAdminNav
  if (role === 'Organizer') return organizerNav
  if (role === 'Coach') return coachNav
  return athleteNav
}

export const HELP_ROUTE = '/help'

/** Account / admin pages and the jump out to the public hub sit below a divider. */
const SECONDARY_ROUTES = new Set([
  '/super-admin/settings',
  '/super-admin/preferences',
  '/super-admin/audit',
  '/organizer/settings',
  '/athlete/settings',
  '/guest',
])

/** Splits a role's nav into the sidebar's groups, keeping each array's own order. */
export function groupNav(items: NavItem[]) {
  return {
    primary: items.filter((i) => i.to !== HELP_ROUTE && !SECONDARY_ROUTES.has(i.to)),
    secondary: items.filter((i) => SECONDARY_ROUTES.has(i.to)),
    help: items.find((i) => i.to === HELP_ROUTE),
  }
}

function matches(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** The sidebar item a path belongs to directly. Longest match wins. */
export function findNavItem(pathname: string, items: NavItem[]): NavItem | undefined {
  let best: NavItem | undefined
  for (const item of items) {
    if (matches(pathname, item) && (!best || item.to.length > best.to.length)) best = item
  }
  return best
}

/** Pages with no sidebar row of their own, and the row they're reached from. */
const PARENT_ROUTES: readonly [prefix: string, parent: string][] = [
  ['/organizer/scoring', '/organizer/events'],
  ['/organizer/match-review', '/organizer/events'],
  ['/athlete/events', '/athlete'],
]

export function isStaffRole(role: string | undefined): boolean {
  return role === 'Organizer' || role === 'Coach' || role === 'Admin'
}

export function notificationsRouteForRole(role: string | undefined): string {
  return isStaffRole(role) ? '/organizer/notifications' : '/athlete/notifications'
}

/**
 * The section a path is in, for the content panel's top bar and the sidebar's
 * active row. Unlike {@link findNavItem} this also resolves pages reached from
 * a row (live scoring → Events) and the Notifications inbox.
 */
export function sectionForPath(pathname: string, role: string | undefined): NavItem | undefined {
  const items = navForRole(role)
  const direct = findNavItem(pathname, items)
  if (direct) return direct
  for (const [prefix, parent] of PARENT_ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const item = items.find((i) => i.to === parent)
      if (item) return item
    }
  }
  const inbox = notificationsRouteForRole(role)
  if (pathname === inbox) return { to: inbox, label: 'Notifications', icon: Bell, exact: true }
  return undefined
}

/** One row of the sidebar — nav links and the sidebar's Notifications row share it. */
export function sidebarRowClass(active: boolean, collapsed: boolean): string {
  return cn(
    'group relative flex h-9 w-full items-center gap-3 rounded-[10px] border text-sm font-medium transition-colors',
    collapsed ? 'justify-center px-0' : 'px-3',
    active
      ? 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]'
      : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--shell-hover)] hover:text-[var(--text-primary)]',
  )
}

export function sidebarIconClass(active: boolean): string {
  return cn(
    'h-4 w-4 shrink-0',
    active
      ? 'text-[var(--brand-ink)]'
      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]',
  )
}
