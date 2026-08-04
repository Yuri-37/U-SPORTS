import React, { useMemo } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router'
import { Trophy, Calendar, LogIn, Globe, LayoutDashboard } from 'lucide-react'
import { useInstitutionStore } from '../../stores/institutionStore'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui'
import AnnouncementBanner from '../announcements/AnnouncementBanner'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import HeaderAccountCluster from './HeaderAccountCluster'
import DarkModeToggle from './DarkModeToggle'

export default function GuestLayout() {
  const { institution } = useInstitutionStore()
  const { profile, session } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const guestAnnouncementModes = useMemo(
    (): ('banner' | 'hero_slider')[] =>
      location.pathname === '/guest' ? ['banner', 'hero_slider'] : ['banner'],
    [location.pathname],
  )

  const scopedProfile = sessionScopedProfile(session, profile)
  const role = scopedProfile?.role
  const isAuthed = Boolean(session && scopedProfile)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="h-14 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {institution?.logo_url ? (
              <div className="flex h-8 max-h-8 items-center justify-center shrink-0 overflow-visible">
                <img
                  src={institution.logo_url}
                  alt="Logo"
                  className="max-h-8 w-auto max-w-[min(100%,7rem)] object-contain object-center"
                />
              </div>
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: 'var(--school-primary)',
                  color: 'var(--school-secondary)',
                }}
              >
                {institution?.abbreviation?.slice(0, 2) ?? 'US'}
              </div>
            )}
            <div className="min-w-0 hidden sm:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--accent-default)] leading-none mb-0.5">
                U-Sports
              </p>
              <p className="font-bold text-sm leading-tight truncate">
                {institution?.abbreviation ?? 'U-Sports'}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">
                {institution?.tagline}
              </p>
            </div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 shrink-0">
          <NavLink
            to="/guest"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-[var(--text-primary)] bg-[var(--surface-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            <Globe className="w-3.5 h-3.5" />
            Hub
          </NavLink>
          <NavLink
            to="/guest/leaderboards"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-[var(--text-primary)] bg-[var(--surface-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            <Trophy className="w-3.5 h-3.5" />
            Standings
          </NavLink>
          <NavLink
            to="/guest/events"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-[var(--text-primary)] bg-[var(--surface-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            <Calendar className="w-3.5 h-3.5" />
            Events
          </NavLink>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <DarkModeToggle />
          {isAuthed && role === 'Admin' && (
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => navigate('/super-admin')}
              icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            >
              Dashboard
            </Button>
          )}
          {isAuthed && (role === 'Organizer' || role === 'Coach') && (
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => navigate('/organizer')}
              icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            >
              Dashboard
            </Button>
          )}
          {isAuthed && role === 'Athlete' && (
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => navigate('/athlete')}
              icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            >
              Dashboard
            </Button>
          )}
          {isAuthed ? (
            <HeaderAccountCluster navVariant="guest" />
          ) : (
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => navigate('/auth/login')}
              icon={<LogIn className="w-3.5 h-3.5" />}
            >
              Sign In
            </Button>
          )}
        </div>
      </header>

      <AnnouncementBanner publicOnly modes={guestAnnouncementModes} />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
