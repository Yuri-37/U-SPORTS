import React, { Suspense, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { useAuth } from './hooks/useAuth'
import { useInstitutionStore } from './stores/institutionStore'
import { useNotificationStore } from './stores/notificationStore'
import { Spinner } from './components/ui'
import { defaultPostLoginPath, safeInternalPath } from './lib/navigation'
import { sessionScopedProfile } from './lib/sessionProfile'
import PrivacyNoticeGate from './components/auth/PrivacyNoticeGate'

export default function App() {
  const { session, profile, loading: authLoading } = useAuth()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { fetchInstitution, loading: institutionLoading } = useInstitutionStore()
  const { fetchNotifications } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Block rendering until both auth AND institution have resolved so we never
  // flash a page only to immediately redirect away.
  const loading = authLoading || institutionLoading

  useEffect(() => {
    fetchInstitution()
  }, [])

  useEffect(() => {
    if (!authLoading && scopedProfile) {
      fetchNotifications(scopedProfile.id)
    }
  }, [scopedProfile, authLoading])

  useEffect(() => {
    const onSuperAdminChord = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== 'a') return
      e.preventDefault()
      const destination =
        session && scopedProfile?.role === 'Admin' ? '/super-admin' : '/super-admin/login'
      navigate(destination, { replace: true })
    }
    window.addEventListener('keydown', onSuperAdminChord)
    return () => window.removeEventListener('keydown', onSuperAdminChord)
  }, [session, scopedProfile, navigate])

  useEffect(() => {
    if (loading) return

    const isPublicRoute =
      location.pathname === '/' ||
      location.pathname.startsWith('/guest') ||
      location.pathname === '/student' ||
      location.pathname.startsWith('/auth') ||
      location.pathname.startsWith('/jumbotron') ||
      location.pathname === '/super-admin/login' ||
      location.pathname === '/privacy-notice'

    if (!session && !isPublicRoute) {
      const from = `${location.pathname}${location.search}`
      navigate('/auth/login', { state: { from }, replace: true })
      return
    }

    // Super admins are excluded from root/auth redirects — / always lands on
    // the guest hub for them. Other authenticated roles go to their dashboards.
    if (
      session &&
      scopedProfile &&
      scopedProfile.role !== 'Admin' &&
      (location.pathname === '/' || location.pathname.startsWith('/auth'))
    ) {
      const returnTo = safeInternalPath((location.state as { from?: string } | null)?.from)
      navigate(returnTo ?? defaultPostLoginPath(scopedProfile.role), { replace: true })
      return
    }

    if (session && scopedProfile) {
      // Organizer/Coach (and Admin) may use the staff shell under /organizer.
      const isStaff =
        scopedProfile.role === 'Admin' ||
        scopedProfile.role === 'Organizer' ||
        scopedProfile.role === 'Coach'
      const wrongRolePath =
        (location.pathname.startsWith('/super-admin') &&
          location.pathname !== '/super-admin/login' &&
          scopedProfile.role !== 'Admin') ||
        (location.pathname.startsWith('/organizer') && !isStaff) ||
        (location.pathname.startsWith('/athlete') && scopedProfile.role !== 'Athlete')

      if (wrongRolePath) {
        navigate(defaultPostLoginPath(scopedProfile.role), { replace: true })
      }
    }
  }, [session, scopedProfile, loading, location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-[var(--text-muted)] text-sm">Loading U-Sports...</p>
        </div>
      </div>
    )
  }

  // /jumbotron runs unattended on a venue TV (already exempt in isPublicRoute
  // above) — an organizer signed in on that same tab must never have the
  // live scoreboard silently replaced by this on reload.
  const isJumbotron = location.pathname.startsWith('/jumbotron')
  if (session && scopedProfile && !scopedProfile.privacy_accepted_at && !isJumbotron) {
    return <PrivacyNoticeGate profile={scopedProfile} />
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}
