import React from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { defaultPostLoginPath } from '../lib/navigation'
import { sessionScopedProfile } from '../lib/sessionProfile'

export default function RootRedirect() {
  const { session, profile } = useAuth()
  const scopedProfile = sessionScopedProfile(session, profile)

  // Super admins are not redirected to their panel from /  — they use
  // Ctrl+Shift+A or the direct /super-admin URL.
  if (session && scopedProfile && scopedProfile.role !== 'Admin') {
    return <Navigate to={defaultPostLoginPath(scopedProfile.role)} replace />
  }

  return <Navigate to="/guest" replace />
}
