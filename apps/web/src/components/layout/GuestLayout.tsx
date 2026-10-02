import React, { useMemo } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router'
import { Trophy, Calendar, LogIn, Globe, LayoutDashboard, MapPin, Smartphone } from 'lucide-react'
import { useInstitutionStore } from '../../stores/institutionStore'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui'
import AnnouncementBanner from '../announcements/AnnouncementBanner'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import HeaderAccountCluster from './HeaderAccountCluster'
import DarkModeToggle from './DarkModeToggle'

const GUEST_NAV = [
  { to: '/guest', label: 'Hub', Icon: Globe, end: true },
  { to: '/guest/leaderboards', label: 'Rankings', Icon: Trophy, end: false },
  { to: '/guest/events', label: 'Events', Icon: Calendar, end: false },
] as const

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
      {/* Semi-transparent + blurred so content scrolling under the bar reads as
          depth rather than a hard cut. */}
      <header className="h-14 bg-[var(--surface-card)]/85 backdrop-blur-md border-b border-[var(--border-subtle)] flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 gap-2">
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

        <nav className="hidden md:flex items-center gap-5 shrink-0 mr-1">
          {GUEST_NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="group">
              {({ isActive }) => (
                <span
                  className={`nav-underline flex items-center gap-1.5 py-1 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                  data-active={isActive ? 'true' : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <DarkModeToggle />
          {/* Not a nav section like Hub/Rankings/Events -- a one-off "get this"
              link, so it sits with the actions. Icon-only on small screens;
              hidden on the app page itself. */}
          {location.pathname !== '/app' && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => navigate('/app')}
              icon={<Smartphone className="w-3.5 h-3.5" />}
              aria-label="Get the app"
            >
              <span className="hidden sm:inline">Get the app</span>
            </Button>
          )}
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
      <GuestFooter />
    </div>
  )
}

/**
 * Site footer. The columns link only to places this platform actually has —
 * there is no product/pricing/company structure to advertise, so inventing
 * those columns would just be dead links dressed as a company.
 */
function GuestFooter() {
  const { institution } = useInstitutionStore()
  const place = [institution?.address, institution?.region].filter((v) => v && v.trim()).join(', ')

  return (
    <footer className="mt-20 border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <div className="max-w-6xl mx-auto px-6 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            {institution?.logo_url ? (
              <img
                src={institution.logo_url}
                alt=""
                className="h-9 w-auto max-w-[7rem] object-contain"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: 'var(--school-primary)',
                  color: 'var(--school-secondary)',
                }}
              >
                {institution?.abbreviation?.slice(0, 2) ?? 'US'}
              </div>
            )}
            <div>
              <p className="font-bold text-sm leading-tight">
                {institution?.name ?? 'U-Sports'}
              </p>
              {institution?.tagline && (
                <p className="text-xs text-[var(--text-muted)]">{institution.tagline}</p>
              )}
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)] leading-relaxed max-w-sm">
            Rosters, schedules, live scoring and rankings for intramural sports. An independent
            student-built platform, not an official university information system.
          </p>
          {place && (
            <p className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {place}
            </p>
          )}
        </div>

        <FooterColumn
          title="Browse"
          links={[
            { to: '/guest', label: 'Hub' },
            { to: '/guest/events', label: 'Events' },
            { to: '/guest/leaderboards', label: 'Rankings' },
            { to: '/app', label: 'Mobile app' },
          ]}
        />
        <FooterColumn
          title="Sports"
          links={[
            { to: '/guest/leaderboards?sport=basketball', label: 'Basketball' },
            { to: '/guest/leaderboards?sport=volleyball', label: 'Volleyball' },
            { to: '/guest/leaderboards?sport=table-tennis', label: 'Table Tennis' },
          ]}
        />
      </div>
      <div className="border-t border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} {institution?.abbreviation ?? 'U-Sports'} · U-Sports
          </span>
          <span className="label-mono text-[var(--text-muted)]">Intramural Sports Platform</span>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { to: string; label: string }[]
}) {
  return (
    <div>
      <p className="label-mono text-[var(--text-muted)] mb-4">{title}</p>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--brand-ink)] transition-colors"
            >
              {l.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
