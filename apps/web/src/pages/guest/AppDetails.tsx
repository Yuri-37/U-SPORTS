import { useNavigate } from 'react-router'
import {
  Radio,
  GitBranch,
  Trophy,
  CalendarDays,
  LogIn,
  CalendarClock,
  BarChart3,
  Bell,
  Users,
  Shirt,
  ListOrdered,
  Calendar,
  Download,
  ShieldCheck,
  Wifi,
  Globe,
  MonitorSmartphone,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import SportIcon from '../../components/ui/SportIcon'
import { Card, Button } from '../../components/ui'
import { SectionLabel, SectionHeading } from '../../components/marketing/Section'
import { APP_RELEASE, APP_PERMISSIONS } from '../../lib/appRelease'

/**
 * Public App Details page for the U-Sports Android app.
 *
 * Every feature listed here exists in the shipped app. In particular there is
 * no self sign-up (organizers create accounts) and no document upload (the
 * eligibility/COR flow was removed in migration 040) -- don't reintroduce
 * either claim without the feature coming back.
 */

type Feature = { icon: LucideIcon; title: string; body: string }

const GUEST_FEATURES: Feature[] = [
  {
    icon: Radio,
    title: 'Live scores',
    body: 'Watch the scoreboard update in real time as each point is recorded — no refreshing.',
  },
  {
    icon: GitBranch,
    title: 'Tournament brackets',
    body: 'Round Robin, Single Elimination and Double Elimination brackets, updated automatically as teams advance.',
  },
  {
    icon: Trophy,
    title: 'Rankings & leaderboards',
    body: 'Team rankings and top player statistics for each sport.',
  },
  {
    icon: CalendarDays,
    title: 'Events & schedules',
    body: 'Browse active events, upcoming matches and past results.',
  },
]

const ATHLETE_FEATURES: Feature[] = [
  {
    icon: LogIn,
    title: 'Your student account',
    body: 'Sign in with the NU Dasmariñas student account the Athletics Department set up for you.',
  },
  {
    icon: CalendarClock,
    title: 'Your match schedule',
    body: 'Upcoming and past games for your team, in one place.',
  },
  {
    icon: BarChart3,
    title: 'Personal statistics',
    body: 'Season stats such as games played, points and sport-specific metrics, plus insights on streaks, trends and milestones.',
  },
  {
    icon: Bell,
    title: 'Push notifications',
    body: 'Alerts for schedule updates and organizer announcements, even when the app is closed.',
  },
]

const COACH_FEATURES: Feature[] = [
  {
    icon: Users,
    title: 'My Teams',
    body: 'The teams you are assigned to coach, with what is live, what is next and recent results.',
  },
  {
    icon: ListOrdered,
    title: 'Rosters',
    body: 'Every player on your team, with jersey numbers, positions and the starting lineup.',
  },
  {
    icon: Shirt,
    title: 'Courtside edits',
    body: 'Update a jersey number, position or starting spot right from your phone.',
  },
  {
    icon: Calendar,
    title: 'Team schedule',
    body: 'Upcoming games and final scores for each team you coach.',
  },
]

const SPORTS = [
  {
    sport: 'basketball',
    name: 'Basketball',
    note: 'Per-quarter scoring and full player box scores.',
  },
  {
    sport: 'volleyball',
    name: 'Volleyball',
    note: 'Set-by-set scores; attack, block, ace, excellent set, excellent dig and receive.',
  },
  { sport: 'table-tennis', name: 'Table Tennis', note: 'Game-by-game scoring and singles rankings.' },
]

// Captured from the release APK in guest mode, so they show team names rather
// than individual students.
const SCREENSHOTS = [
  { src: '/app/home.webp', caption: 'Home' },
  { src: '/app/live.webp', caption: 'Live scores' },
  { src: '/app/standings.webp', caption: 'Rankings' },
  { src: '/app/signin.webp', caption: 'Sign in' },
]

const INSTALL_STEPS = [
  'Tap Download APK on your Android phone.',
  'When asked, allow your browser to "install unknown apps". The app is shared directly as an APK rather than through the Play Store.',
  'Open the downloaded file and tap Install.',
  'Open U-Sports. Browse as a guest, or sign in with your student account.',
]

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function AppDetails() {
  const navigate = useNavigate()
  const released = formatDate(APP_RELEASE.releasedAt)
  const download = () => window.location.assign(APP_RELEASE.downloadUrl)

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden glow-brand">
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-16 lg:pt-24 flex flex-col items-center text-center animate-fade-in-up">
          <SectionLabel>Android app</SectionLabel>
          <h1 className="font-display text-[2.75rem] sm:text-6xl lg:text-[4.5rem] mt-5 text-[var(--text-primary)]">
            U-Sports
          </h1>
          <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            Live scores, brackets, and athlete stats for NU Dasmariñas intramurals.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <Button
              size="xl"
              onClick={download}
              icon={<Download className="w-5 h-5" />}
              className="w-full sm:w-auto"
            >
              Download APK
            </Button>
            <Button
              size="xl"
              variant="outline"
              onClick={() => navigate('/guest')}
              icon={<Globe className="w-5 h-5" />}
              className="w-full sm:w-auto"
            >
              Open in browser
            </Button>
          </div>
          {/* Secondary, not muted: at 11px on the page background the muted
              gray measured 4.34:1, and this line is real information. */}
          <p className="mt-6 label-mono text-[var(--text-secondary)]">
            Version {APP_RELEASE.version} · {APP_RELEASE.sizeMb} MB · Updated {released}
          </p>
        </div>

        {/* Screenshots straight from the shipped app. */}
        <div className="max-w-5xl mx-auto px-6 pb-20">
          <div className="flex justify-center gap-5 overflow-x-auto pb-2 stagger">
            {SCREENSHOTS.map((s) => (
              <figure key={s.src} className="shrink-0 w-[11.5rem] sm:w-[13rem] text-center">
                <div className="rounded-[1.75rem] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-lift-lg)]">
                  <img
                    src={s.src}
                    alt={`U-Sports app — ${s.caption} screen`}
                    loading="lazy"
                    className="w-full rounded-[1.4rem]"
                  />
                </div>
                <figcaption className="mt-3 text-sm text-[var(--text-muted)]">{s.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-24 text-center">
        <SectionHeading align="center" label="About" title="Intramurals, in your pocket" />
        <div className="space-y-5 text-lg text-[var(--text-secondary)] leading-relaxed">
          <p>
            U-Sports brings NU Dasmariñas intramural sports to your phone. Follow live games, check
            brackets and rankings, and — if you're a student-athlete — see your own schedule and
            performance, all in one app.
          </p>
          <p>
            It is the mobile companion to the U-Sports system used by the NU Dasmariñas Athletics
            Department. Scores and results entered by organizers appear on your phone within
            seconds, with no refreshing needed.
          </p>
        </div>
      </section>

      <FeatureSection
        label="Guest mode"
        title="For everyone"
        subtitle="No account needed."
        features={GUEST_FEATURES}
      />
      <FeatureSection
        label="Student-athletes"
        title="For NU Dasmariñas athletes"
        features={ATHLETE_FEATURES}
      />
      <FeatureSection
        label="Coaches"
        title="For coaches"
        subtitle="The roster and schedule you need courtside, without a laptop."
        features={COACH_FEATURES}
      />

      {/* ── Sports ───────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <SectionHeading align="center" label="Sports" title="Supported sports" />
        <div className="grid gap-6 sm:grid-cols-3 stagger">
          {SPORTS.map((s) => (
            <Card key={s.name} className="p-8 text-center">
              <SportIcon
                sport={s.sport}
                className="mx-auto h-10 w-10 text-[var(--accent-default)]"
              />
              <h3 className="mt-4 font-semibold text-lg tracking-[-0.01em]">{s.name}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{s.note}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Install (inverted) ───────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, var(--school-primary) 0%, color-mix(in srgb, var(--school-primary) 55%, #000) 100%)',
        }}
      >
        <div className="absolute inset-0 texture-dots" aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-3xl lg:text-[2.6rem] leading-[1.15] text-white">
            Install on Android
          </h2>
          <ol className="mt-12 space-y-6 text-left">
            {INSTALL_STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-5">
                <span className="shrink-0 h-10 w-10 rounded-full bg-white text-[var(--school-primary)] font-display text-lg flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="pt-1.5 text-white/90 leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12">
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center justify-center gap-2 h-14 px-7 rounded-xl bg-white text-[var(--school-primary)] font-semibold shadow-[var(--shadow-lift-lg)] transition-[translate,scale,box-shadow] duration-[160ms] ease-out hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Download className="w-5 h-5" />
              Download APK · {APP_RELEASE.sizeMb} MB
            </button>
          </div>
        </div>
      </section>

      {/* ── Your data + Good to know ─────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24 grid gap-6 md:grid-cols-2">
        <Card className="p-8">
          <div className="flex items-center gap-3">
            <IconTile icon={ShieldCheck} />
            <h3 className="font-semibold text-lg">Your data</h3>
          </div>
          <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
            The app shows your name, team and roster details, match statistics, and your profile
            photo if you add one. Rosters and stats are managed by authorized Athletics Department
            staff. Your notification token is used only to deliver U-Sports alerts.
          </p>
          <button
            type="button"
            onClick={() => navigate('/privacy-notice')}
            className="mt-5 text-sm font-medium text-[var(--brand-ink)] hover:underline"
          >
            Read the privacy notice →
          </button>
        </Card>

        <Card className="p-8">
          <div className="flex items-center gap-3">
            <IconTile icon={Wifi} />
            <h3 className="font-semibold text-lg">Good to know</h3>
          </div>
          <ul className="mt-4 space-y-3 text-[var(--text-secondary)] leading-relaxed">
            <li>Live scores and notifications need an internet connection.</li>
            <li>
              Student accounts are for NU Dasmariñas students. Fans, family and guests can follow
              games in Guest Mode.
            </li>
            <li>
              Event setup, bracket generation and scoring are handled by organizers on the
              U-Sports web portal.
            </li>
          </ul>
        </Card>
      </section>

      {/* ── App info ─────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <SectionHeading align="center" label="Details" title="App information" />
        <Card className="p-0 overflow-hidden">
          <dl className="divide-y divide-[var(--border-subtle)]">
            <InfoRow label="Version" value={APP_RELEASE.version} />
            <InfoRow label="Updated" value={released} />
            <InfoRow label="Size" value={`${APP_RELEASE.sizeMb} MB`} />
            <InfoRow label="Requires" value={APP_RELEASE.minAndroid} />
            <InfoRow label="Price" value="Free" />
            <div className="px-6 py-5">
              <dt className="label-mono text-[var(--text-muted)]">Permissions</dt>
              <dd className="mt-3 space-y-2">
                {APP_PERMISSIONS.map((p) => (
                  <p key={p.name} className="text-sm">
                    <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                    <span className="text-[var(--text-secondary)]"> — {p.why}</span>
                  </p>
                ))}
              </dd>
            </div>
          </dl>
        </Card>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
          <MonitorSmartphone className="w-4 h-4 shrink-0" />
          Organizers and administrators use the web portal.
        </p>
      </section>

      {/* ── Credit ───────────────────────────────────────────────────────── */}
      <section className="border-t border-[var(--border-subtle)]">
        <p className="max-w-3xl mx-auto px-6 py-12 text-center text-sm text-[var(--text-muted)] leading-relaxed">
          U-Sports was developed as a capstone project by BSIT students of the National University
          – Dasmariñas.
        </p>
      </section>
    </div>
  )
}

function FeatureSection({
  label,
  title,
  subtitle,
  features,
}: {
  label: string
  title: string
  subtitle?: string
  features: Feature[]
}) {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-24">
      <SectionHeading align="center" label={label} title={title} subtitle={subtitle} />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger">
        {features.map((f) => (
          <Card key={f.title} className="p-7 text-center flex flex-col items-center">
            <IconTile icon={f.icon} />
            <h3 className="mt-5 font-semibold text-base tracking-[-0.01em]">{f.title}</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{f.body}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}

/** Brand-colored icon container — solid navy, no accent-blue gradient. */
function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex items-center justify-center h-12 w-12 shrink-0 rounded-xl bg-[var(--school-primary)] text-white shadow-[var(--shadow-lift)]">
      <Icon className="w-5 h-5" />
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4">
      <dt className="label-mono text-[var(--text-muted)]">{label}</dt>
      <dd className="text-sm font-medium text-[var(--text-primary)] text-right">{value}</dd>
    </div>
  )
}
