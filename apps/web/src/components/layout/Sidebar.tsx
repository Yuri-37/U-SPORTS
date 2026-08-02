import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  LayoutDashboard, Users, Calendar, BarChart3, Settings,
  Megaphone, Trophy, ChevronLeft, ChevronRight,
  ClipboardList, User, Globe,
  Dumbbell, UserCheck, Building2,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useInstitutionStore } from '../../stores/institutionStore'
import { cn } from '../../lib/utils'
import { sessionScopedProfile } from '../../lib/sessionProfile'

const superAdminNav = [
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
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
]

const organizerNav = [
  { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
  { to: '/organizer/athletes', label: 'Athletes', icon: UserCheck },
  { to: '/organizer/events', label: 'Events', icon: Trophy },
  { to: '/organizer/teams', label: 'Teams', icon: Dumbbell },
  { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/organizer/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/organizer/settings', label: 'Settings', icon: Settings },
]

const coachNav = [
  { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
  { to: '/organizer/athletes', label: 'Athletes', icon: UserCheck },
  { to: '/organizer/teams', label: 'Teams', icon: Dumbbell },
  { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/organizer/settings', label: 'Settings', icon: Settings },
]

const athleteNav = [
  { to: '/athlete', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/athlete/profile', label: 'My Profile', icon: User },
  { to: '/athlete/settings', label: 'Settings', icon: Settings, exact: true },
  { to: '/guest', label: 'Browse hub', icon: Globe, exact: false },
]

export default function Sidebar() {
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { institution } = useInstitutionStore()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const navItems =
    scopedProfile?.role === 'Admin'
      ? superAdminNav
      : scopedProfile?.role === 'Organizer'
      ? organizerNav
      : scopedProfile?.role === 'Coach'
      ? coachNav
      : athleteNav

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 flex flex-col bg-[var(--surface-card)] border-r border-[var(--border-subtle)] transition-all duration-200 z-20',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Brand header */}
      <div
        className="h-14 flex items-center px-4 gap-3 border-b border-[var(--border-subtle)]"
        style={{ backgroundColor: 'var(--school-primary)' }}
      >
        {institution?.logo_url ? (
          <div className="flex h-9 max-h-9 items-center justify-center shrink-0 overflow-visible">
            <img
              src={institution.logo_url}
              alt="Logo"
              className="max-h-9 w-auto max-w-[min(100%,8rem)] object-contain object-center flex-shrink-0"
            />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--school-secondary)] flex items-center justify-center text-xs font-bold text-[var(--school-primary)] flex-shrink-0">
            {institution?.abbreviation?.slice(0, 2) ?? 'US'}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white/60 font-bold text-[9px] uppercase tracking-[0.15em] leading-none mb-0.5">
              U-Sports
            </p>
            <p className="text-[var(--school-secondary)] font-bold text-sm truncate font-[Barlow_Condensed] leading-tight">
              {institution?.abbreviation ?? 'U-Sports'}
            </p>
            <p className="text-[var(--school-secondary)]/60 text-[10px] truncate">{institution?.tagline}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={Boolean(item.exact)}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5',
                isActive
                  ? 'bg-[#0066FF]/15 text-[var(--accent-default)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Platform wordmark — persistent brand mark distinct from the school's own branding above */}
      {!collapsed && (
        <p className="text-center text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--accent-default)] py-2 border-t border-[var(--border-subtle)]">
          U-Sports
        </p>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}
