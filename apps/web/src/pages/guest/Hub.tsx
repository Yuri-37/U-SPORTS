import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Trophy, Tv2, MapPin } from 'lucide-react'
import { Card, Badge, Button, Skeleton, Modal } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { useAuthStore } from '../../stores/authStore'

import type { Event, MatchScore } from '../../types'
import { getSportLabel, getSportIcon, formatEnumLabel, eventPublicLifecycleLabel } from '../../lib/utils'
import { sessionScopedProfile } from '../../lib/sessionProfile'

import { fetchParticipantLabels } from '../../lib/participantLabels'
import { liveScorePresentation, pickScoresForMatch } from '../../lib/liveMatchPresentation'
import { deriveEliminationPodium, type EventPlacement, placementRankLabel } from '../../lib/eventPlacements'

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
  event: { id: string; name: string; sport: string }
  placements: EventPlacement[]
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
  const [loading, setLoading] = useState(true)

  const selectedLiveMatch = selectedLiveId ? liveMatches.find((m) => m.id === selectedLiveId) ?? null : null


  const reloadLiveMatches = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(
        `*,
        scores:match_scores(*),
        event:events(name, sport)`
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
      .select('id,name,sport')
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
      rows.push({ event: ev as { id: string; name: string; sport: string }, placements: podium })
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

  useEffect(() => {
    let cancelled = false

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
      })
      .subscribe()

    return () => {
      cancelled = true
      channel.unsubscribe()
    }
  }, [reloadLiveMatches, loadRecentEvents, loadChampionSpotlights])

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
      pid ? liveParticipantNames[pid] ?? `Participant ${pid.slice(0, 8)}…` : 'TBD'
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Hero */}
      <div
        className="relative rounded-2xl overflow-hidden py-16 px-8 text-center"
        style={{ background: `linear-gradient(135deg, var(--school-primary) 0%, #001833 100%)` }}
      >
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #FFD700 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative">
          <p className="text-[var(--school-secondary)] font-bold text-sm uppercase tracking-widest mb-2">Live Sports Platform</p>
          <h1 className="text-5xl font-black font-[Barlow_Condensed] tracking-wide text-white mb-2">{institution?.abbreviation ?? 'U-Sports'}</h1>
          <p className="text-white/60 text-lg">{institution?.name}</p>
          <p className="text-white/40 italic mt-1">{institution?.tagline}</p>
        </div>
      </div>

      {championSpotlights.length > 0 && (
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-[var(--warning)]" />
            Recent champions
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Knockout finals from completed competitions. Tap an event for brackets and match history.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {championSpotlights.map(({ event: ev, placements }) => {
              const champ = placements.find((p) => p.rank === 1)
              const runner = placements.find((p) => p.rank === 2)
              return (
                <Card
                  key={ev.id}
                  className="cursor-pointer hover:border-white/20 transition-colors"
                  onClick={() => navigate(`/guest/events/${ev.id}`)}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xl">{getSportIcon(ev.sport as any)}</span>
                    <Badge variant="success" size="sm">
                      Completed
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm mb-3">{ev.name}</h3>
                  <div className="space-y-2 text-xs">
                    {champ ? (
                      <p className="text-[var(--text-secondary)]">
                        <span className="text-[var(--text-muted)]">{placementRankLabel(1)}: </span>
                        <span className="font-medium text-[var(--text-primary)]">{championLabels[champ.participantId] ?? '—'}</span>
                      </p>
                    ) : null}
                    {runner ? (
                      <p className="text-[var(--text-secondary)]">
                        <span className="text-[var(--text-muted)]">{placementRankLabel(2)}: </span>
                        <span className="font-medium">{championLabels[runner.participantId] ?? '—'}</span>
                      </p>
                    ) : null}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Live now */}
      {liveMatches.length > 0 && (
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-[var(--danger)] animate-pulse-live" />
            Live Now
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
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
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{v.sportPretty}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate mb-1">{v.eventTitle}</p>
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] mb-2">
                    <span className="truncate">{v.phase}</span>
                    <span className="shrink-0 font-medium text-[var(--accent-default)]">Details →</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold truncate flex-1 text-[var(--text-primary)]" title={v.nameA}>
                      {v.nameA}
                    </span>
                  </div>
                  <div className="flex items-center justify-between my-2">
                    <span className="text-3xl font-black font-[Barlow_Condensed] text-[var(--text-primary)]">{v.left}</span>
                    <span className="text-[var(--text-muted)] text-xs font-semibold px-2">VS</span>
                    <span className="text-3xl font-black font-[Barlow_Condensed] text-[var(--text-primary)]">{v.right}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold truncate flex-1 text-[var(--text-primary)] text-right" title={v.nameB}>
                      {v.nameB}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 truncate">{v.subtitle}</p>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <Modal
        open={!!selectedLiveMatch}
        onClose={() => setSelectedLiveId(null)}
        title={selectedLiveMatch ? livePresentation(selectedLiveMatch).eventTitle : 'Live'}
        size="lg"
      >
        {selectedLiveMatch && (() => {
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
              {v.venueLine && (
                <p className="text-xs text-[var(--text-muted)]">{v.venueLine}</p>
              )}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Home</p>
                    <p className="text-lg font-bold truncate text-[var(--text-primary)]">{v.nameA}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-4xl font-black font-[Barlow_Condensed] text-[var(--school-secondary,#FFD700)]">{v.left}</span>
                    <span className="text-[var(--text-muted)] text-sm">—</span>
                    <span className="text-4xl font-black font-[Barlow_Condensed] text-[var(--school-secondary,#FFD700)]">{v.right}</span>
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Away</p>
                    <p className="text-lg font-bold truncate text-[var(--text-primary)]">{v.nameB}</p>
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
                  onClick={() => window.open(`/jumbotron/${vm.id}`, '_blank', 'noopener,noreferrer')}
                >
                  Open full-screen jumbotron
                </Button>
                <Button variant="secondary" className="flex-1 min-w-[120px]" onClick={() => navigate(`/guest/events/${vm.event_id}`)}>
                  Event page
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Recent events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Events</h2>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <Button size="sm" variant="ghost" onClick={() => navigate('/guest/events')}>
            Upcoming →
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/guest/events?view=past')}>
            Past results →
          </Button>
        </div>
        </div>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : recentEvents.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-2">No upcoming or live events to show here right now.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentEvents.map((e) => (
              <Card key={e.id} className="cursor-pointer hover:border-white/20" onClick={() => navigate(`/guest/events/${e.id}`)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{getSportIcon(e.sport as any)}</span>
                  <Badge variant={e.status === 'in_progress' ? 'danger' : 'info'} size="sm">
                    {eventPublicLifecycleLabel(e.status)}
                  </Badge>
                </div>
                <h3 className="font-bold text-sm">{e.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 capitalize">{formatEnumLabel(e.format ?? '')}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sports quick links */}
      <div>
        <h2 className="text-xl font-bold mb-4">Browse by Sport</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { sport: 'basketball', label: 'Basketball', icon: '🏀' },
            { sport: 'volleyball', label: 'Volleyball', icon: '🏐' },
            { sport: 'table-tennis', label: 'Table Tennis', icon: '🏓' },
          ].map((s) => (
            <button
              key={s.sport}
              onClick={() => navigate(`/guest/leaderboards?sport=${s.sport}`)}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-[var(--border-subtle)] hover:border-white/20 transition-all"
            >
              <span className="text-4xl">{s.icon}</span>
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Location footer */}
      {[institution?.address, institution?.region].some((v) => v && v.trim()) && (
        <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] pt-2">
          <MapPin className="w-4 h-4 shrink-0" />
          <span>{[institution?.address, institution?.region].filter((v) => v && v.trim()).join(', ')}</span>
        </div>
      )}
    </div>
  )
}
