import React from 'react'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import OnlineOrganizers from './OnlineOrganizers'
import HeaderAccountCluster from './HeaderAccountCluster'
import DarkModeToggle from './DarkModeToggle'

/** Top bar beside the sidebar — branding lives in {@link Sidebar}, so this stays actions-only. */
export default function TopNav() {
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)

  return (
    <header className="h-14 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex items-center justify-end px-6 gap-3 z-30 sticky top-0">
      <div className="flex items-center gap-3">
        {(scopedProfile?.role === 'Organizer' ||
          scopedProfile?.role === 'Coach' ||
          scopedProfile?.role === 'Admin') && <OnlineOrganizers />}
        <DarkModeToggle />
        <HeaderAccountCluster />
      </div>
    </header>
  )
}
