import React from 'react'
import { useLocation } from 'react-router'
import { Menu } from 'lucide-react'
import { useNavDrawer } from '../../stores/navDrawerStore'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import OnlineOrganizers from './OnlineOrganizers'
import DarkModeToggle from './DarkModeToggle'
import { isStaffRole, sectionForPath } from './navConfig'

/**
 * Slim bar across the top of the content panel: where you are on the left
 * (the same icon + label as the sidebar row), workspace toggles on the right.
 * Notifications and the account menu live at the foot of the sidebar.
 */
export default function TopNav() {
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const location = useLocation()
  const role = scopedProfile?.role
  const section = sectionForPath(location.pathname, role)
  const SectionIcon = section?.icon
  const { open, setOpen } = useNavDrawer()

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-3 sm:px-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-controls="app-sidebar"
        aria-expanded={open}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {section && SectionIcon && (
          <>
            <SectionIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            <span className="truncate font-medium text-[var(--text-primary)]">{section.label}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {isStaffRole(role) && <OnlineOrganizers />}
        <DarkModeToggle />
      </div>
    </header>
  )
}
