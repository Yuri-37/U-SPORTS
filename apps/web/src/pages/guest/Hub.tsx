import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Trophy, Tv2 } from 'lucide-react'
import { Card, Badge, Button, Skeleton, Modal } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { useAuthStore } from '../../stores/authStore'

import type { Event, MatchScore } from '../../types'
import {
  getSportLabel,
  getSportIcon,
  formatEnumLabel,
  eventPublicLifecycleLabel,
} from '../../lib/utils'
import { sessionScopedProfile } from '../../lib/sessionProfile'

import { fetchParticipantLabels } from '../../lib/participantLabels'
import { liveScorePresentation, pickScoresForMatch } from '../../lib/liveMatchPresentation'
import {
  deriveEliminationPodium,
  type EventPlacement,
  placementRankLabel,
} from '../../lib/eventPlacements'

type LiveHubMatch = {
  id: string
  event_id: string
  participant_a_id: string | null
  participant_b_id: string | null
  status: string
  venue?: string | null
  scores?: MatchScore[]
  event?: { name?: string | null; sport?: string | null } | null
}

type ChampionSpotlight = {
  event: { id: string; slug: string; name: string; sport: string }
  placements: EventPlacement[]
}

/** Counts behind the stats band. Every figure is a real row count. */
type PlatformStats = {
  athletes: number
  teams: number
  events: number
  matchesPlayed: number
}

export default function GuestHub() {
  const { institution } = useInstitutionStore()
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const navigate = useNavigate()
  const [liveMatches, setLiveMatches] = useState<LiveHubMatch[]>([])
  const [livePeriodByMatch, setLivePeriodByMatch] = useState<Record<string, number>>({})
  const [liveParticipantNames, setLiveParticipantNames] = useState<Record<string, string>>({})
  const [selectedLiveId, setSelectedLiveId] = useState<string | null>(null)
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [championSpotlights, setChampionSpotlights] = useState<ChampionSpotlight[]>([])
  const [championLabels, setChampionLabels] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  const selectedLiveMatch = selectedLiveId
    ? (liveMatches.find((m) => m.id === selectedLiveId) ?? null)
    : null

  const reloadLiveMatches = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(
        `*,
        scores:match_scores(*),
        event:events(name, sport)`,
      )
      .eq('status', 'live')
      .limit(10)

    const list = (data ?? []) as LiveHubMatch[]
    setLiveMatches(list)

    const partIds = new Set<string>()
    for (const m of list) {
      if (m.participant_a_id) partIds.add(m.participant_a_id)
      if (m.participant_b_id) partIds.add(m.participant_b_id)
    }
    if (partIds.size === 0) {
      setLiveParticipantNames({})
      setLivePeriodByMatch({})
      return
    }

    try {
      const labels = await fetchParticipantLabels([...partIds])
      setLiveParticipantNames(labels)
    } catch {
      setLiveParticipantNames({})
    }

    const mids = list.map((m) => m.id)
    if (mids.length === 0) {
      setLivePeriodByMatch({})
      return
    }

    const { data: actions } = await supabase
      .from('scoring_actions')
      .select('match_id, quarter_or_set, timestamp')
      .in('match_id', mids)
      .eq('undone', false)
      .order('timestamp', { ascending: false })

    const nextPeriod: Record<string, number> = {}
    const seenMid = new Set<string>()
    for (const row of actions ?? []) {
      const mid = row.match_id as string
      if (seenMid.has(mid)) continue
      seenMid.add(mid)
      nextPeriod[mid] = row.quarter_or_set != null ? Number(row.quarter_or_set) : 1
    }
    for (const mid of mids) {
      if (nextPeriod[mid] == null) nextPeriod[mid] = 1
    }
    setLivePeriodByMatch(nextPeriod)
  }, [])

  const loadRecentEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .in('status', ['registration', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(6)
    setRecentEvents(data ?? [])
  }, [])

  const loadChampionSpotlights = useCallback(async () => {
    const { data: completed } = await supabase
      .from('events')
      .select('id,slug,name,sport')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(8)

    const rows: ChampionSpotlight[] = []
    const partIds = new Set<string>()
    for (const ev of completed ?? []) {
      const { data: br } = await supabase
        .from('brackets')
        .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
        .eq('event_id', ev.id)
      const podium = deriveEliminationPodium(br ?? [])
      if (!podium) continue
      rows.push({
        event: ev as { id: string; slug: string; name: string; sport: string },
        placements: podium,
      })
      podium.forEach((p) => partIds.add(p.participantId))
    }
    setChampionSpotlights(rows)
    if (partIds.size === 0) {
      setChampionLabels({})
      return
    }
    try {
      const labels = await fetchParticipantLabels([...partIds])
      setChampionLabels(labels)
    } catch {
      setChampionLabels({})
    }
  }, [])

  /**
   * Row counts for the stats band. `head: true` fetches no rows — just the
   * count — so this stays cheap. If a table isn't readable anonymously the
   * whole band is dropped rather than shown with a zero, because a real
   * roster rendered as "0 athletes" is worse than no figure at all.
   */
  const loadStats = useCallback(async () => {
    const countOf = async (table: string, apply?: (q: any) => any) => {
      let q = supabase.from(table).select('id', { count: 'exact', head: true })
      if (apply) q = apply(q)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    }
    try {
      const [athletes, teams, events, matchesPlayed] = await Promise.all([
        countOf('athletes'),
        countOf('teams'),
        countOf('events'),
        countOf('matches', (q) => q.eq('status', 'completed')),
      ])
      setStats({ athletes, teams, events, matchesPlayed })
    } catch {
      setStats(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void loadStats()

    Promise.all([reloadLiveMatches(), loadRecentEvents(), loadChampionSpotlights()]).then(() => {
      if (cancelled) return
      setLoading(false)
    })

    const channel = supabase
      .channel('hub-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void reloadLiveMatches()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_scores' }, () => {
        void reloadLiveMatches()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scoring_actions' }, () => {
        void reloadLiveMatches()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        void loadRecentEvents()
        void loadChampionSpotlights()
        void loadStats()
      })
      .subscribe()

    return () => {
      cancelled = true
      channel.unsubscribe()
    }
  }, [reloadLiveMatches, loadRecentEvents, loadChampionSpotlights, loadStats])

  useEffect(() => {
    if (!selectedLiveId) return
    if (!liveMatches.some((m) => m.id === selectedLiveId)) setSelectedLiveId(null)
  }, [liveMatches, selectedLiveId])

  const livePresentation = (m: LiveHubMatch) => {
    const sport = (m.event?.sport as string) || 'basketball'
    const { sa, sb } = pickScoresForMatch(m.participant_a_id, m.participant_b_id, m.scores)
    const period = livePeriodByMatch[m.id] ?? 1
    const pres = liveScorePresentation(sport, sa, sb, period)
    const nameOf = (pid: string | null) =>
      pid ? (liveParticipantNames[pid] ?? `Participant ${pid.slice(0, 8)}…`) : 'TBD'
    return {
      ...pres,
      nameA: nameOf(m.participant_a_id),
      nameB: nameOf(m.participant_b_id),
      eventTitle: m.event?.name?.trim() || 'Live match',
      sportPretty: getSportLabel(sport as any),
      venueLine: (m.venue && m.venue.trim()) || null,
    }
  }

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden glow-brand">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="animate-fade-in-up">
            <SectionLabel>Live Sports Platform</SectionLabel>
            <h1 className="font-display text-[2.75rem] sm:text-6xl lg:text-[5.25rem] mt-5 text-[var(--text-primary)]">
              {institution?.abbreviation ?? 'U-Sports'}{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, var(--school-primary), var(--accent-default))',
                }}
              >
                Athletics
              </span>
            </h1>
            <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl">
              {institution?.name ?? 'Intramural sports'} — rosters, schedules, live scoring and
              standings, in one place. Follow every game as it happens.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate('/guest/events')}>
                Browse events
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/guest/leaderboards')}>
                View standings
              </Button>
            </div>
            {liveMatches.length > 0 && (
              <p className="mt-8 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse-dot" />
                <span className="text-xl font-bold text-[var(--school-primary)] dark:text-[var(--school-secondary)]">
                  {liveMatches.length}
                </span>
                {liveMatches.length === 1 ? 'game' : 'games'} being played right now
              </p>
            )}
          </div>

          {/* Generative graphic. Decorative only, so it's hidden from assistive
              tech and dropped entirely on small screens. */}
          <div className="hidden lg:block" aria-hidden="true">
            <HeroGraphic logoUrl={institution?.logo_url ?? null} />
          </div>

        </div>
      </section>

      {/* ── Live now ───────────────────────────────────────────────────────── */}
      {liveMatches.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <SectionHeading
            label="Happening now"
            title="Live games"
            dot="danger"
            action={{ label: 'All events →', onClick: () => navigate('/guest/events') }}
          />
          <div className="grid sm:grid-cols-2 gap-6 stagger">
            {liveMatches.map((m) => {
              const v = livePresentation(m)
              return (
                <Card
                  key={m.id}
                  className="hover:border-[var(--danger)]/50 transition-colors"
                  onClick={() => setSelectedLiveId(m.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="danger">LIVE</Badge>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {v.sportPretty}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate mb-1">{v.eventTitle}</p>
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] mb-2">
                    <span className="truncate">{v.phase}</span>
                    <span className="shrink-0 font-medium text-[var(--accent-default)]">
                      Details →
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-bold truncate flex-1 text-[var(--text-primary)]"
                      title={v.nameA}
                    >
                      {v.nameA}
                    </span>
                  </div>
                  <div className="flex items-center justify-between my-2">
                    <span className="text-3xl font-black font-[Barlow_Condensed] text-[var(--text-primary)]">
                      {v.left}
                    </span>
                    <span className="text-[var(--text-muted)] text-xs font-semibold px-2">VS</span>
                    <span className="text-3xl font-black font-[Barlow_Condensed] text-[var(--text-primary)]">
                      {v.right}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-bold truncate flex-1 text-[var(--text-primary)] text-right"
                      title={v.nameB}
                    >
                      {v.nameB}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 truncate">{v.subtitle}</p>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      <Modal
        open={!!selectedLiveMatch}
        onClose={() => setSelectedLiveId(null)}
        title={selectedLiveMatch ? livePresentation(selectedLiveMatch).eventTitle : 'Live'}
        size="lg"
      >
        {selectedLiveMatch &&
          (() => {
            const vm = selectedLiveMatch
            const v = livePresentation(vm)
            return (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Badge variant="danger">LIVE</Badge>
                  <span>{v.sportPretty}</span>
                  <span>·</span>
                  <span>{v.phase}</span>
                </div>
                {v.venueLine && <p className="text-xs text-[var(--text-muted)]">{v.venueLine}</p>}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-muted)] mb-1">Home</p>
                      <p className="text-lg font-bold truncate text-[var(--text-primary)]">
                        {v.nameA}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-4xl font-black font-[Barlow_Condensed] text-[var(--text-primary)] tabular-nums">
                        {v.left}
                      </span>
                      <span className="text-[var(--text-muted)] text-sm">—</span>
                      <span className="text-4xl font-black font-[Barlow_Condensed] text-[var(--text-primary)] tabular-nums">
                        {v.right}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-xs text-[var(--text-muted)] mb-1">Away</p>
                      <p className="text-lg font-bold truncate text-[var(--text-primary)]">
                        {v.nameB}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-4 text-center">{v.subtitle}</p>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Scores refresh automatically while this match stays live.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="flex-1 min-w-[140px]"
                    icon={<Tv2 className="w-4 h-4" />}
                    onClick={() =>
                      window.open(`/jumbotron/${vm.id}`, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Open full-screen jumbotron
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 min-w-[120px]"
                    onClick={() => navigate(`/guest/events/${vm.event_id}`)}
                  >
                    Event page
                  </Button>
                </div>
              </div>
            )
          })()}
      </Modal>

      {/* ── Events ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-8">
        <SectionHeading
          label="Schedule"
          title="Events"
          action={{ label: 'Upcoming →', onClick: () => navigate('/guest/events') }}
          secondaryAction={{
            label: 'Past results →',
            onClick: () => navigate('/guest/events?view=past'),
          }}
        />
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : recentEvents.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-2">
            No upcoming or live events to show here right now.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
            {recentEvents.map((e) => (
              <Card
                key={e.id}
                className="p-6"
                onClick={() => navigate(`/guest/events/${e.slug}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{getSportIcon(e.sport as any)}</span>
                  <Badge variant={e.status === 'in_progress' ? 'danger' : 'info'} size="sm">
                    {eventPublicLifecycleLabel(e.status)}
                  </Badge>
                </div>
                <h3 className="font-semibold text-base leading-snug">{e.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 capitalize">
                  {formatEnumLabel(e.format ?? '')}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Sports ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <SectionHeading label="Competitions" title="Browse by sport" />
        {/*
          Asymmetric on desktop: the first tile takes two rows so the grid
          reads as a composition rather than three equal boxes. On mobile it
          collapses to a single column and the span is dropped.
        */}
        <div className="grid gap-6 lg:grid-cols-3 lg:grid-rows-2 stagger">
          {SPORT_TILES.map((s, i) => (
            <Card
              key={s.sport}
              interactive
              onClick={() => navigate(`/guest/leaderboards?sport=${s.sport}`)}
              className={`group p-8 flex flex-col ${
                // The tall tile centres its content: pinning the link to the
                // bottom of a double-height card left an obvious dead zone.
                i === 0 ? 'lg:col-span-2 lg:row-span-2 lg:justify-center' : ''
              }`}
            >
              <span
                className="inline-flex items-center justify-center h-12 w-12 rounded-lg text-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
                style={{
                  background:
                    'linear-gradient(to bottom right, var(--school-primary), var(--accent-default))',
                }}
              >
                {s.icon}
              </span>
              <h3
                className={`mt-6 font-semibold tracking-[-0.01em] ${
                  i === 0 ? 'text-2xl' : 'text-lg'
                }`}
              >
                {s.label}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-md">
                {s.blurb}
              </p>
              {/* Counted from data already on the page — no extra queries. */}
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                <MiniStat
                  value={liveMatches.filter((m) => m.event?.sport === s.sport).length}
                  label="Live now"
                />
                <MiniStat
                  value={recentEvents.filter((e) => e.sport === s.sport).length}
                  label="Open events"
                />
              </div>
              <span
                className={`${i === 0 ? 'mt-8' : 'mt-auto pt-8'} text-sm font-medium text-[var(--school-primary)] dark:text-[var(--school-secondary)] group-hover:underline`}
              >
                View standings →
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Stats (inverted) ───────────────────────────────────────────────── */}
      {stats && (
        <section
          className="relative overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, var(--school-primary) 0%, color-mix(in srgb, var(--school-primary) 55%, #000) 100%)',
          }}
        >
          <div className="absolute inset-0 texture-dots" aria-hidden="true" />
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(50% 60% at 90% 0%, rgba(255,255,255,0.06) 0%, transparent 70%)',
            }}
          />
          <div className="relative max-w-6xl mx-auto px-6 py-24 lg:py-32">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-12 lg:divide-x lg:divide-white/20">
              <StatCell value={stats.athletes} label="Athletes" />
              <StatCell value={stats.teams} label="Teams" />
              <StatCell value={stats.events} label="Competitions" />
              <StatCell value={stats.matchesPlayed} label="Games played" />
            </div>
          </div>
        </section>
      )}

      {/* ── Champions ──────────────────────────────────────────────────────── */}
      {championSpotlights.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-24">
          <SectionHeading
            label="Results"
            title="Recent champions"
            subtitle="Knockout finals from completed competitions. Open an event for its full bracket and match history."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {championSpotlights.slice(0, 6).map(({ event: ev, placements }, i) => {
              const champ = placements.find((p) => p.rank === 1)
              const runner = placements.find((p) => p.rank === 2)
              // The middle card of a full row sits proud, per the spec's
              // elevated-centre treatment.
              const featured = i === 1
              const body = (
                <Card
                  interactive
                  onClick={() => navigate(`/guest/events/${ev.slug}`)}
                  className={`h-full p-7 ${featured ? 'lg:-translate-y-6 shadow-[var(--shadow-lift-lg)]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="text-2xl">{getSportIcon(ev.sport as any)}</span>
                    <Badge variant="success" size="sm">
                      Completed
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-base leading-snug mb-5">{ev.name}</h3>
                  <div className="space-y-2.5 text-sm">
                    {champ && (
                      <p className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 shrink-0 text-[var(--school-secondary)]" />
                        <span className="text-[var(--text-muted)]">{placementRankLabel(1)}</span>
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {championLabels[champ.participantId] ?? '—'}
                        </span>
                      </p>
                    )}
                    {runner && (
                      <p className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <span className="w-4 shrink-0" />
                        <span className="text-[var(--text-muted)]">{placementRankLabel(2)}</span>
                        <span className="truncate">
                          {championLabels[runner.participantId] ?? '—'}
                        </span>
                      </p>
                    )}
                  </div>
                </Card>
              )
              // Featured card gets a 2px brand→accent gradient frame.
              return featured ? (
                <div
                  key={ev.id}
                  className="rounded-xl p-[2px] lg:mb-0"
                  style={{
                    background:
                      'linear-gradient(to bottom right, var(--school-primary), var(--accent-default), var(--school-primary))',
                  }}
                >
                  {body}
                </div>
              ) : (
                <div key={ev.id}>{body}</div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Closing CTA ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(to right, rgba(var(--school-primary-rgb), 0.12), transparent 45%, rgba(var(--school-primary-rgb), 0.12))',
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6 py-24 lg:py-32 text-center">
          <h2 className="font-display text-4xl lg:text-[3.25rem] leading-[1.15]">
            Follow the season
          </h2>
          <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed">
            {scopedProfile
              ? 'Jump back into your dashboard, or keep browsing the public results.'
              : 'Anyone can browse events, brackets and standings. Sign in to see your own team, stats and schedule.'}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="xl" onClick={() => navigate('/guest/events')} className="w-full sm:w-auto">
              Browse events
            </Button>
            {!scopedProfile && (
              <Button
                size="xl"
                variant="outline"
                onClick={() => navigate('/auth/login')}
                className="w-full sm:w-auto"
              >
                Sign in
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/** Sport tiles for the features grid. `blurb` describes what the tile opens. */
const SPORT_TILES = [
  {
    sport: 'basketball',
    label: 'Basketball',
    icon: '🏀',
    blurb:
      'Per-quarter scoring, player box scores and season leaders across every division.',
  },
  {
    sport: 'volleyball',
    label: 'Volleyball',
    icon: '🏐',
    blurb: 'Set-by-set results with attack, block and excellent-dig leaders.',
  },
  {
    sport: 'table-tennis',
    label: 'Table Tennis',
    icon: '🏓',
    blurb: 'Best-of-series brackets and singles standings.',
  },
] as const

/** Small monospace kicker that opens a section. */
function SectionLabel({
  children,
  dot = 'brand',
}: {
  children: React.ReactNode
  dot?: 'brand' | 'danger'
}) {
  return (
    <span className="inline-flex items-center gap-3 rounded-full border border-[var(--school-primary)]/25 bg-[var(--school-primary)]/5 px-4 py-1.5">
      <span
        className={`h-2 w-2 rounded-full ${
          dot === 'danger' ? 'bg-[var(--danger)] animate-pulse-dot' : 'bg-[var(--school-primary)]'
        }`}
      />
      <span className="label-mono text-[var(--school-primary)] dark:text-[var(--school-secondary)]">
        {children}
      </span>
    </span>
  )
}

/** Section opener: kicker, display heading, optional blurb and inline actions. */
function SectionHeading({
  label,
  title,
  subtitle,
  dot,
  action,
  secondaryAction,
}: {
  label: string
  title: string
  subtitle?: string
  dot?: 'brand' | 'danger'
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <SectionLabel dot={dot}>{label}</SectionLabel>
        <h2 className="font-display text-3xl lg:text-[2.6rem] leading-[1.15] mt-4">{title}</h2>
        {subtitle && (
          <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{subtitle}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-1 flex-wrap">
          {action && (
            <Button size="sm" variant="ghost" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** One figure in the inverted stats band. */
function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 text-center">
      <p className="font-display text-4xl lg:text-5xl text-white">{value.toLocaleString()}</p>
      <p className="label-mono mt-3 text-white/70">{label}</p>
    </div>
  )
}

/**
 * Hero graphic: a slowly turning dashed ring, two floating cards, a brand
 * corner block and a dot grid. Entirely decorative — it carries no
 * information, which is why the caller marks it aria-hidden and drops it on
 * small screens rather than trying to reflow it.
 */
function HeroGraphic({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div className="relative aspect-square w-full max-w-sm mx-auto">
      {/* Turning dashed ring */}
      <div
        className="absolute inset-[6%] rounded-full animate-ring-spin"
        style={{
          border: '1.5px dashed rgba(var(--school-primary-rgb), 0.28)',
        }}
      />
      {/* Inner solid ring */}
      <div
        className="absolute inset-[22%] rounded-full"
        style={{ border: '1px solid rgba(var(--accent-rgb), 0.18)' }}
      />

      {/* Dot grid, bottom-left */}
      <div
        className="absolute left-[4%] bottom-[8%] h-20 w-20 texture-dots-brand rounded-md"
        style={{ backgroundSize: '16px 16px' }}
      />

      {/* Brand corner block */}
      <div
        className="absolute right-[6%] top-[10%] h-16 w-16 rounded-2xl"
        style={{
          background: 'var(--school-primary)',
          boxShadow: '0 12px 32px rgba(var(--school-primary-rgb), 0.35)',
        }}
      />

      {/* Centre medallion — the institution's own mark, unaltered */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-28 w-28 rounded-full bg-[var(--surface-card)] shadow-[var(--shadow-lift-lg)] flex items-center justify-center">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-16 w-auto object-contain" />
          ) : (
            <span className="font-display text-2xl text-[var(--school-primary)]">US</span>
          )}
        </div>
      </div>

      {/* Floating cards */}
      <div className="absolute left-[2%] top-[26%] animate-float">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-lift)]">
          <p className="label-mono text-[var(--text-muted)]">Live</p>
          <p className="font-display text-xl leading-none mt-1.5">78–72</p>
        </div>
      </div>
      <div className="absolute right-[0%] bottom-[20%] animate-float-slow">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-lift)]">
          <p className="label-mono text-[var(--text-muted)]">Sets</p>
          <p className="font-display text-xl leading-none mt-1.5">3–1</p>
        </div>
      </div>
    </div>
  )
}

/** Compact figure + label pair used inside the sport tiles. */
function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl leading-none text-[var(--text-primary)]">{value}</p>
      <p className="label-mono mt-1.5 text-[var(--text-muted)]">{label}</p>
    </div>
  )
}
