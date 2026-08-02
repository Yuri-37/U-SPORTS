import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Calendar, TrendingUp, TrendingDown, Users, MapPin, ChevronRight, History } from 'lucide-react'
import { Card, Badge, Alert, StatCard, Skeleton, EmptyState, Modal, Select, Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, formatEnumLabel, formatDateTime } from '../../lib/utils'
import { fetchParticipantLabels } from '../../lib/participantLabels'
import { pickScoresForMatch } from '../../lib/liveMatchPresentation'
import { deriveEliminationPodium } from '../../lib/eventPlacements'
import type { Insight, MatchScore, PlayerSeasonStats, Season } from '../../types'

type SeasonStatRow = PlayerSeasonStats & { season: Pick<Season, 'id' | 'name' | 'status'> | null }

type SeasonScheduleMatch = {
  id: string
  event_id: string | null
  scheduled_at: string | null
  venue: string | null
  status: string
  participant_a_id: string | null
  participant_b_id: string | null
  event?: { name?: string; sport?: string } | null
}

type StatDrilldown =
  | 'games'
  | 'ppg'
  | 'rpg'
  | 'apg'
  | 'kills'
  | 'aces'
  | 'digs'
  | 'mw'
  | 'win_pct'
  | 'sets_won'

type UpcomingMatchRow = {
  id: string
  event_id: string | null
  scheduled_at: string | null
  venue: string | null
  status: string
  eventName: string
  sport: string
  opponentLabel: string
}

type EventFinishHighlight = { eventId: string; eventName: string; sport: string; rank: 1 | 2 }

function sortAthleteUpcomingMatches<
  T extends { status?: string | null; scheduled_at?: string | null },
>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const liveA = a.status === 'live'
    const liveB = b.status === 'live'
    if (liveA && !liveB) return -1
    if (!liveA && liveB) return 1
    const hasA = !!a.scheduled_at
    const hasB = !!b.scheduled_at
    const ta = matchSortTs(a.scheduled_at ?? null)
    const tb = matchSortTs(b.scheduled_at ?? null)
    if (hasA && hasB) return ta - tb
    if (hasA && !hasB) return -1
    if (!hasA && hasB) return 1
    return 0
  })
}

type TeamRosterMember = {
  id: string
  position: string | null
  jersey_number: string | null
  lineup_slot: number | null
  profile: { full_name: string } | null
}

type TeamCoachContact = { full_name: string; email: string }

type TeamRosterGroup = {
  teamId: string
  teamName: string
  sport: string
  coaches: TeamCoachContact[]
  members: TeamRosterMember[]
}

type TeamEmbedWithCoaches = {
  id?: string
  name?: string
  sport?: string
  coaches?: Array<{ organizer?: { profile?: { full_name?: string | null; email?: string | null } | null } | null }>
} | null

function coachesFromTeamEmbed(team: TeamEmbedWithCoaches): TeamCoachContact[] {
  const coaches: TeamCoachContact[] = []
  for (const c of team?.coaches ?? []) {
    const p = c.organizer?.profile
    const full_name = p?.full_name?.trim()
    if (!full_name) continue
    coaches.push({ full_name, email: String(p?.email ?? '').trim() })
  }
  return coaches
}

function matchSortTs(s: string | null): number {
  if (!s) return 0
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : 0
}

function sortAthletePastMatches<T extends { scheduled_at?: string | null }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => matchSortTs(b.scheduled_at ?? null) - matchSortTs(a.scheduled_at ?? null))
}

function dedupeMatchesById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, r)
  }
  return [...map.values()]
}

function sortName(a: TeamRosterMember, b: TeamRosterMember) {
  return (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '')
}

const MATCH_STAT_LABELS: Record<string, Record<string, string>> = {
  basketball: {
    total_points: 'Points',
    total_rebounds: 'Rebounds',
    off_rebounds: 'Off. rebounds',
    total_assists: 'Assists',
    total_steals: 'Steals',
    total_blocks: 'Blocks',
    turnovers: 'Turnovers',
    fg_made: 'Field goals made',
    fg_attempted: 'Field goals att.',
    three_made: '3-pointers made',
    three_attempted: '3-pointers att.',
    ft_made: 'Free throws made',
    ft_attempted: 'Free throws att.',
    fouls: 'Fouls',
  },
  volleyball: {
    pts_scored: 'Points scored',
    kills: 'Kills',
    attacks: 'Attacks',
    aces: 'Aces',
    digs: 'Digs',
    blocks: 'Blocks',
    assists: 'Sets',
    errors: 'Errors',
    serve_errors: 'Serve errors',
    reception_errors: 'Reception errors',
  },
  'table-tennis': {
    pts_scored: 'Points scored',
    winners: 'Winners',
    aces: 'Aces',
    errors: 'Errors',
  },
}

const MATCH_STAT_ORDER: Record<string, string[]> = {
  basketball: [
    'total_points', 'total_rebounds', 'off_rebounds', 'total_assists', 'total_steals',
    'total_blocks', 'turnovers', 'fg_made', 'fg_attempted', 'three_made', 'three_attempted',
    'ft_made', 'ft_attempted', 'fouls',
  ],
  volleyball: ['pts_scored', 'kills', 'attacks', 'aces', 'digs', 'blocks', 'assists', 'errors', 'serve_errors', 'reception_errors'],
  'table-tennis': ['pts_scored', 'winners', 'aces', 'errors'],
}

function formatAthleteMatchStats(sport: string, stats: Record<string, number> | undefined) {
  if (!stats) return [] as { key: string; label: string; value: number }[]
  const order = MATCH_STAT_ORDER[sport] ?? Object.keys(stats)
  const labels = MATCH_STAT_LABELS[sport] ?? {}
  const rows: { key: string; label: string; value: number }[] = []
  const seen = new Set<string>()
  for (const key of order) {
    if (!(key in stats)) continue
    rows.push({ key, label: labels[key] ?? formatEnumLabel(key.replace(/_/g, ' ')), value: stats[key] ?? 0 })
    seen.add(key)
  }
  for (const key of Object.keys(stats)) {
    if (seen.has(key)) continue
    rows.push({ key, label: labels[key] ?? formatEnumLabel(key.replace(/_/g, ' ')), value: stats[key] ?? 0 })
  }
  return rows
}

function bbTeamTotal(sc: Partial<MatchScore> | undefined) {
  return (
    Number(sc?.q1 ?? 0) +
    Number(sc?.q2 ?? 0) +
    Number(sc?.q3 ?? 0) +
    Number(sc?.q4 ?? 0) +
    Number(sc?.ot ?? 0)
  )
}

function scheduleOpponentLabel(m: SeasonScheduleMatch, myTeamIds: string[], labels: Record<string, string>) {
  const onA = m.participant_a_id != null && myTeamIds.includes(m.participant_a_id)
  const onB = m.participant_b_id != null && myTeamIds.includes(m.participant_b_id)
  const oppId = onA ? m.participant_b_id : onB ? m.participant_a_id : null
  if (!oppId) return 'Opponent TBD'
  const name = labels[oppId]?.trim()
  return name || 'Opponent'
}

export default function AthleteDashboard() {
  const { profile, athlete } = useAuthStore()
  const navigate = useNavigate()
  const [seasonStatRows, setSeasonStatRows] = useState<SeasonStatRow[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatchRow[]>([])
  const [pastMatches, setPastMatches] = useState<UpcomingMatchRow[]>([])
  const [eventFinishes, setEventFinishes] = useState<EventFinishHighlight[]>([])
  const [finishesLoading, setFinishesLoading] = useState(false)
  const [teamRoster, setTeamRoster] = useState<TeamRosterGroup[]>([])
  const [teamDetailModal, setTeamDetailModal] = useState<TeamRosterGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [myTeamIds, setMyTeamIds] = useState<string[]>([])
  const [seasonGamesLog, setSeasonGamesLog] = useState<{
    matches: SeasonScheduleMatch[]
    statsByMatchId: Record<string, Record<string, number>>
    scoresByMatchId: Record<string, MatchScore[]>
  }>({ matches: [], statsByMatchId: {}, scoresByMatchId: {} })
  const [scheduleParticipantLabels, setScheduleParticipantLabels] = useState<Record<string, string>>({})
  const [gamesLogLoading, setGamesLogLoading] = useState(false)
  const [statDrilldown, setStatDrilldown] = useState<StatDrilldown | null>(null)
  const [gameDetailMatchId, setGameDetailMatchId] = useState<string | null>(null)
  const [showPasswordNudge, setShowPasswordNudge] = useState(false)

  // password_changed_at is null until the athlete has ever used self-service
  // change-password (POST /api/auth/change-password) — the closest reliable
  // proxy for "still on the account-creation password" without new schema.
  // sessionStorage keeps this to once per browser session rather than once
  // per visit to this page.
  useEffect(() => {
    if (!profile || profile.password_changed_at) return
    if (sessionStorage.getItem('usports_password_nudge_shown') === '1') return
    sessionStorage.setItem('usports_password_nudge_shown', '1')
    setShowPasswordNudge(true)
  }, [profile])

  const selectedSeasonStats = useMemo(
    () => seasonStatRows.find((r) => r.season_id === selectedSeasonId) ?? null,
    [seasonStatRows, selectedSeasonId]
  )

  const seasonSelectOptions = useMemo(
    () =>
      seasonStatRows.map((r) => ({
        value: r.season_id,
        label: r.season?.name
          ? `${r.season.name} (${formatEnumLabel(r.season.status)})`
          : `Season (${r.season_id.slice(0, 8)}…)`,
      })),
    [seasonStatRows]
  )

  const gamesScheduleBuckets = useMemo(() => {
    const matches = seasonGamesLog.matches
    const live = matches.filter((m) => m.status === 'live')
    const upcoming = matches
      .filter((m) => m.status === 'scheduled')
      .slice()
      .sort((a, b) => {
        const hasA = !!a.scheduled_at
        const hasB = !!b.scheduled_at
        const ta = matchSortTs(a.scheduled_at)
        const tb = matchSortTs(b.scheduled_at)
        if (hasA && hasB) return ta - tb
        if (hasA && !hasB) return -1
        if (!hasA && hasB) return 1
        return 0
      })
    const past = matches
      .filter((m) => m.status === 'completed' || m.status === 'cancelled')
      .slice()
      .sort((a, b) => matchSortTs(b.scheduled_at) - matchSortTs(a.scheduled_at))
    return { live, upcoming, past }
  }, [seasonGamesLog.matches])

  const matchesWithBoxScores = useMemo(() => {
    const { matches, statsByMatchId } = seasonGamesLog
    return matches
      .filter((m) => {
        const s = statsByMatchId[m.id]
        return s && Object.keys(s).length > 0
      })
      .slice()
      .sort((a, b) => matchSortTs(b.scheduled_at) - matchSortTs(a.scheduled_at))
  }, [seasonGamesLog])

  const seasonDetailTitle =
    selectedSeasonStats?.season?.name ??
    seasonStatRows.find((r) => r.season_id === selectedSeasonId)?.season?.name ??
    'This season'

  useEffect(() => {
    if (!athlete) return
    let cancelled = false

    ;(async () => {
      setLoading(true)
      try {
        const [statsRes, insightsRes, tmRes] = await Promise.all([
          supabase
            .from('player_season_stats')
            .select('*, season:seasons(id, name, status)')
            .eq('athlete_id', athlete.id)
            .order('updated_at', { ascending: false }),
          supabase
            .from('insights')
            .select('*')
            .eq('entity_type', 'player')
            .eq('entity_id', athlete.id)
            .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(3),
          supabase.from('team_members').select('team_id').eq('athlete_id', athlete.id),
        ])

        if (cancelled) return
        const rows = (statsRes.data ?? []) as SeasonStatRow[]
        setSeasonStatRows(rows)
        if (rows.length > 0) {
          const activeFirst = rows.find((r) => r.season?.status === 'active')
          setSelectedSeasonId(activeFirst?.season_id ?? rows[0].season_id)
        } else {
          setSelectedSeasonId(null)
        }
        setInsights(insightsRes.data ?? [])

        const teamIds = [...new Set((tmRes.data ?? []).map((t: { team_id: string }) => t.team_id))]
        setMyTeamIds(teamIds)
        if (teamIds.length === 0) {
          setUpcomingMatches([])
          setPastMatches([])
          setTeamRoster([])
          return
        }

        const { data: rawMatches } = await supabase
          .from('matches')
          .select(
            'id, event_id, scheduled_at, venue, status, participant_a_id, participant_b_id, event:events(name, sport)'
          )
          .in('status', ['scheduled', 'live'])
          .limit(96)

        const mineRaw = (rawMatches ?? []).filter(
          (m: {
            participant_a_id: string | null
            participant_b_id: string | null
            status: string
          }) =>
            (m.participant_a_id != null && teamIds.includes(m.participant_a_id)) ||
            (m.participant_b_id != null && teamIds.includes(m.participant_b_id))
        ) as {
          id: string
          event_id: string | null
          scheduled_at: string | null
          venue: string | null
          status: string
          participant_a_id: string
          participant_b_id: string
          event?: { name?: string; sport?: string }
        }[]

        const mine = sortAthleteUpcomingMatches(dedupeMatchesById(mineRaw)).slice(0, 8)

        const oppIds = new Set<string>()
        for (const m of mine) {
          const onA = teamIds.includes(m.participant_a_id)
          const oppId = onA ? m.participant_b_id : m.participant_a_id
          if (oppId) oppIds.add(oppId)
        }

        const teamNames: Record<string, string> = {}
        if (oppIds.size > 0) {
          const { data: teams } = await supabase.from('teams').select('id, name').in('id', [...oppIds])
          for (const t of teams ?? []) teamNames[t.id] = t.name
        }

        const upcoming: UpcomingMatchRow[] = mine.map((m) => {
          const onA = teamIds.includes(m.participant_a_id)
          const oppId = onA ? m.participant_b_id : m.participant_a_id
          return {
            id: m.id,
            event_id: m.event_id,
            scheduled_at: m.scheduled_at,
            venue: m.venue,
            status: m.status,
            eventName: m.event?.name ?? 'Event',
            sport: m.event?.sport ?? athlete.sport,
            opponentLabel: oppId ? teamNames[oppId] ?? 'Opponent TBD' : 'Opponent TBD',
          }
        })

        const { data: rawPast } = await supabase
          .from('matches')
          .select(
            'id, event_id, scheduled_at, venue, status, participant_a_id, participant_b_id, event:events(name, sport)'
          )
          .in('status', ['completed', 'cancelled'])
          .limit(120)

        const minePastRaw = (rawPast ?? []).filter(
          (m: {
            participant_a_id: string | null
            participant_b_id: string | null
          }) =>
            (m.participant_a_id != null && teamIds.includes(m.participant_a_id)) ||
            (m.participant_b_id != null && teamIds.includes(m.participant_b_id))
        ) as {
          id: string
          event_id: string | null
          scheduled_at: string | null
          venue: string | null
          status: string
          participant_a_id: string
          participant_b_id: string
          event?: { name?: string; sport?: string }
        }[]

        const minePast = sortAthletePastMatches(dedupeMatchesById(minePastRaw)).slice(0, 8)
        const pastOppIds = new Set<string>()
        for (const m of minePast) {
          const onA = teamIds.includes(m.participant_a_id)
          const oppId = onA ? m.participant_b_id : m.participant_a_id
          if (oppId) pastOppIds.add(oppId)
        }
        const pastTeamNames: Record<string, string> = { ...teamNames }
        if (pastOppIds.size > 0) {
          const need = [...pastOppIds].filter((id) => !pastTeamNames[id])
          if (need.length > 0) {
            const { data: pastTeams } = await supabase.from('teams').select('id, name').in('id', need)
            for (const t of pastTeams ?? []) pastTeamNames[t.id] = t.name
          }
        }

        const pastRows: UpcomingMatchRow[] = minePast.map((m) => {
          const onA = teamIds.includes(m.participant_a_id)
          const oppId = onA ? m.participant_b_id : m.participant_a_id
          return {
            id: m.id,
            event_id: m.event_id,
            scheduled_at: m.scheduled_at,
            venue: m.venue,
            status: m.status,
            eventName: m.event?.name ?? 'Event',
            sport: m.event?.sport ?? athlete.sport,
            opponentLabel: oppId ? pastTeamNames[oppId] ?? 'Opponent TBD' : 'Opponent TBD',
          }
        })

        const { data: members } = await supabase
          .from('team_members')
          .select(
            `
            team_id,
            lineup_slot,
            team:teams(
              id,
              name,
              sport,
              coaches:team_coaches(
                organizer:organizers(profile:profiles!organizers_profile_id_fkey(full_name, email))
              )
            ),
            athlete:athletes(id, position, jersey_number, profile:profiles!athletes_profile_id_fkey(full_name))
          `
          )
          .in('team_id', teamIds)

        const byTeam = new Map<string, TeamRosterGroup>()
        for (const row of members ?? []) {
          const tm = row.team as TeamEmbedWithCoaches
          const ath = row.athlete as {
            id?: string
            position?: string | null
            jersey_number?: string | null
            profile?: { full_name: string } | null
          } | null
          const tid = row.team_id as string
          const slot = row.lineup_slot as number | null
          if (!byTeam.has(tid)) {
            byTeam.set(tid, {
              teamId: tid,
              teamName: tm?.name ?? 'Team',
              sport: tm?.sport ?? athlete.sport,
              coaches: coachesFromTeamEmbed(tm),
              members: [],
            })
          }
          if (ath?.id) {
            byTeam.get(tid)!.members.push({
              id: ath.id,
              position: ath.position ?? null,
              jersey_number: ath.jersey_number ?? null,
              lineup_slot: slot,
              profile: ath.profile ?? null,
            })
          }
        }

        if (!cancelled) {
          setUpcomingMatches(upcoming)
          setPastMatches(pastRows)
          setTeamRoster([...byTeam.values()])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [athlete])

  useEffect(() => {
    if (!athlete?.id) {
      setEventFinishes([])
      return
    }
    let cancelled = false
    setFinishesLoading(true)
    ;(async () => {
      try {
        const { data: tm } = await supabase.from('team_members').select('team_id').eq('athlete_id', athlete.id)
        const finishTeamIds = [...new Set((tm ?? []).map((t: { team_id: string }) => t.team_id))]
        if (finishTeamIds.length === 0) {
          if (!cancelled) setEventFinishes([])
          return
        }
        const { data: eps } = await supabase
          .from('event_participants')
          .select('event_id, participant_id')
          .in('participant_id', finishTeamIds)
        const finishEvIds = [...new Set((eps ?? []).map((e: { event_id: string }) => e.event_id))]
        if (finishEvIds.length === 0) {
          if (!cancelled) setEventFinishes([])
          return
        }
        const { data: evs } = await supabase
          .from('events')
          .select('id,name,sport')
          .in('id', finishEvIds)
          .eq('status', 'completed')

        const out: EventFinishHighlight[] = []
        for (const ev of evs ?? []) {
          const myParticipants = new Set(
            (eps ?? [])
              .filter((e: { event_id: string }) => e.event_id === ev.id)
              .map((e: { participant_id: string }) => e.participant_id)
          )
          const { data: br } = await supabase
            .from('brackets')
            .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
            .eq('event_id', ev.id)
          const podium = deriveEliminationPodium(br ?? [])
          if (!podium) continue
          const mine = podium.find((p) => myParticipants.has(p.participantId))
          if (!mine) continue
          out.push({
            eventId: ev.id as string,
            eventName: ev.name as string,
            sport: ev.sport as string,
            rank: mine.rank,
          })
        }
        out.sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank
          return a.eventName.localeCompare(b.eventName)
        })
        if (!cancelled) setEventFinishes(out)
      } finally {
        if (!cancelled) setFinishesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [athlete?.id])

  useEffect(() => {
    if (!athlete?.id || !selectedSeasonId || myTeamIds.length === 0) {
      setSeasonGamesLog({ matches: [], statsByMatchId: {}, scoresByMatchId: {} })
      setScheduleParticipantLabels({})
      setGamesLogLoading(false)
      return
    }
    let cancelled = false
    setGamesLogLoading(true)

    ;(async () => {
      const { data: evs } = await supabase
        .from('events')
        .select('id')
        .eq('season_id', selectedSeasonId)
        .eq('sport', athlete.sport)

      const eventIds = (evs ?? []).map((e: { id: string }) => e.id)
      if (eventIds.length === 0) {
        if (!cancelled) {
          setSeasonGamesLog({ matches: [], statsByMatchId: {}, scoresByMatchId: {} })
          setScheduleParticipantLabels({})
          setGamesLogLoading(false)
        }
        return
      }

      const { data: allMatches } = await supabase
        .from('matches')
        .select(
          'id, event_id, scheduled_at, venue, status, participant_a_id, participant_b_id, event:events(name, sport)'
        )
        .in('event_id', eventIds)

      const relevant = dedupeMatchesById(
        (allMatches ?? []).filter(
          (m: { participant_a_id: string | null; participant_b_id: string | null }) =>
            (m.participant_a_id != null && myTeamIds.includes(m.participant_a_id)) ||
            (m.participant_b_id != null && myTeamIds.includes(m.participant_b_id))
        ) as SeasonScheduleMatch[]
      )

      const matchIds = relevant.map((m) => m.id)
      const statsByMatchId: Record<string, Record<string, number>> = {}
      const scoresByMatchId: Record<string, MatchScore[]> = {}

      const participantIds = new Set<string>()
      for (const m of relevant) {
        if (m.participant_a_id) participantIds.add(m.participant_a_id)
        if (m.participant_b_id) participantIds.add(m.participant_b_id)
      }

      let labels: Record<string, string> = {}
      if (participantIds.size > 0) {
        try {
          labels = await fetchParticipantLabels([...participantIds])
        } catch {
          labels = {}
        }
      }

      if (matchIds.length > 0) {
        const [{ data: pgs }, { data: msRows }] = await Promise.all([
          supabase.from('player_game_stats').select('match_id, stats').eq('athlete_id', athlete.id).in('match_id', matchIds),
          supabase.from('match_scores').select('*').in('match_id', matchIds),
        ])

        for (const row of pgs ?? []) {
          statsByMatchId[row.match_id as string] = (row.stats as Record<string, number>) ?? {}
        }

        for (const row of msRows ?? []) {
          const mid = row.match_id as string
          if (!scoresByMatchId[mid]) scoresByMatchId[mid] = []
          scoresByMatchId[mid].push(row as MatchScore)
        }
      }

      if (!cancelled) {
        setSeasonGamesLog({ matches: relevant, statsByMatchId, scoresByMatchId })
        setScheduleParticipantLabels(labels)
        setGamesLogLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [athlete?.id, athlete?.sport, selectedSeasonId, myTeamIds])

  if (!athlete) {
    return (
      <div className="space-y-4">
        <Alert type="warning">Your athlete profile is not set up. Please contact support.</Alert>
      </div>
    )
  }

  const positionLine = athlete.position?.trim()
    ? athlete.position
    : 'Position will appear here once your coach assigns it'

  const openEventDetail = (eventId: string | null) => {
    if (!eventId) return
    navigate(`/athlete/events/${eventId}?tab=matches`)
  }

  const selectedGameDetailMatch = useMemo(
    () =>
      gameDetailMatchId ? (seasonGamesLog.matches.find((x) => x.id === gameDetailMatchId) ?? null) : null,
    [gameDetailMatchId, seasonGamesLog.matches]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {profile?.full_name.split(' ')[0]}!</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {getSportIcon(athlete.sport as any)} {getSportLabel(athlete.sport as any)} · {positionLine}
          </p>
        </div>
        <Badge variant={athlete.season_status === 'active' ? 'success' : 'default'}>
          {athlete.season_status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-6">
        <div>
          <h2 className="font-bold mb-1 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0066FF]" />
            Upcoming games
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Open an event for the full match schedule and bracket.</p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : upcomingMatches.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-12 h-12 mx-auto text-[var(--text-muted)]" />}
              title="No upcoming games"
              description="When your team is in an event bracket, matches appear here—even before a date and time are set."
            />
          ) : (
            <div className="space-y-2">
              {upcomingMatches.map((m) => {
                const canOpen = Boolean(m.event_id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!canOpen}
                    onClick={() => openEventDetail(m.event_id)}
                    className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Card className="flex items-start gap-3 hover:border-white/20 transition-colors">
                      <span className="text-2xl">{getSportIcon(m.sport as any)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <p className="font-semibold text-sm truncate">{m.eventName}</p>
                          {m.status === 'live' ? (
                            <Badge variant="danger" size="sm">
                              Live
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">vs {m.opponentLabel}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1 flex-wrap">
                          {m.scheduled_at ? (
                            formatDateTime(m.scheduled_at)
                          ) : m.status === 'scheduled' ? (
                            <span className="text-[var(--text-muted)]">Date and time not set yet</span>
                          ) : null}
                          {m.venue ? (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{m.venue}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {canOpen ? <ChevronRight className="w-5 h-5 text-[var(--text-muted)] shrink-0 mt-1" /> : null}
                    </Card>
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-8">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-bold flex items-center gap-2">
                <History className="w-4 h-4 text-[#0066FF]" />
                Match history
              </h2>
              <button
                type="button"
                onClick={() => navigate('/athlete/profile')}
                className="text-xs text-[#0066FF] hover:underline focus-visible:outline-none"
              >
                Full history →
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Completed bracket games. 🏆/🥈 badge means your team placed in that event.
            </p>
            {loading || finishesLoading ? (
              <Skeleton className="h-20" />
            ) : pastMatches.length === 0 ? (
              <EmptyState
                icon={<History className="w-10 h-10 mx-auto text-[var(--text-muted)]" />}
                title="No past games yet"
                description="When matches are marked completed, they show here so you can reopen the event anytime."
              />
            ) : (
              <div className="space-y-2">
                {pastMatches.map((m) => {
                  const canOpen = Boolean(m.event_id)
                  const placement = m.event_id
                    ? eventFinishes.find((f) => f.eventId === m.event_id)
                    : undefined
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!canOpen}
                      onClick={() => openEventDetail(m.event_id)}
                      className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Card className="flex items-start gap-3 hover:border-white/20 transition-colors">
                        <span className="text-2xl">{getSportIcon(m.sport as any)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <p className="font-semibold text-sm truncate">{m.eventName}</p>
                            <Badge size="sm" variant={m.status === 'cancelled' ? 'default' : 'success'}>
                              {formatEnumLabel(m.status)}
                            </Badge>
                            {placement && (
                              <Badge size="sm" variant={placement.rank === 1 ? 'warning' : 'info'}>
                                {placement.rank === 1 ? '🏆 Champion' : '🥈 Runner-up'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">vs {m.opponentLabel}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1 flex-wrap">
                            {m.scheduled_at ? (
                              formatDateTime(m.scheduled_at)
                            ) : (
                              <span className="text-[var(--text-muted)]">Date not recorded</span>
                            )}
                            {m.venue ? (
                              <>
                                <span className="text-[var(--text-muted)]">·</span>
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{m.venue}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        {canOpen ? <ChevronRight className="w-5 h-5 text-[var(--text-muted)] shrink-0 mt-1" /> : null}
                      </Card>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-bold mb-1 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0066FF]" />
            My team
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">Tap a team for the full roster and starting lineup vs bench.</p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-24" />
            </div>
          ) : teamRoster.length === 0 ? (
            <EmptyState
              icon={<Users className="w-12 h-12 mx-auto text-[var(--text-muted)]" />}
              title="No team assignment yet"
              description="After your organizer adds you to a team roster, your squad appears here."
            />
          ) : (
            <div className="space-y-4">
              {teamRoster.map((g) => (
                <button
                  key={g.teamId}
                  type="button"
                  onClick={() => setTeamDetailModal(g)}
                  className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]"
                >
                  <Card className="hover:border-white/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{getSportIcon(g.sport as any)}</span>
                        <div>
                          <p className="font-semibold">{g.teamName}</p>
                          <p className="text-xs text-[var(--text-muted)]">{getSportLabel(g.sport as any)}</p>
                          {g.coaches.length > 0 ? (
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                              Coach:{' '}
                              {g.coaches.map((c, i) => (
                                <React.Fragment key={`${g.teamId}-${c.email}-${i}`}>
                                  {i > 0 ? ', ' : null}
                                  {c.email ? (
                                    <a
                                      href={`mailto:${encodeURIComponent(c.email)}`}
                                      className="text-[#0066FF] hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {c.full_name}
                                    </a>
                                  ) : (
                                    <span>{c.full_name}</span>
                                  )}
                                </React.Fragment>
                              ))}
                            </p>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)] mt-1">No coach assigned yet.</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                    </div>
                    <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
                      {g.members
                        .slice()
                        .sort(sortName)
                        .map((mem) => (
                          <li
                            key={mem.id}
                            className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-1 last:border-0"
                          >
                            <span className="truncate">{mem.profile?.full_name ?? 'Teammate'}</span>
                            <span className="text-[var(--text-muted)] text-xs shrink-0">
                              {mem.jersey_number ? `#${mem.jersey_number}` : ''}
                              {mem.jersey_number && mem.position?.trim() ? ' · ' : ''}
                              {mem.position?.trim() || ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      <Modal
        open={teamDetailModal !== null}
        onClose={() => setTeamDetailModal(null)}
        title={teamDetailModal ? `${teamDetailModal.teamName} — roster` : ''}
        size="lg"
      >
        {teamDetailModal && (
          <div className="space-y-6">
            <p className="text-sm text-[var(--text-muted)]">
              {getSportIcon(teamDetailModal.sport as any)} {getSportLabel(teamDetailModal.sport as any)}
            </p>

            {teamDetailModal.coaches.length > 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Coach:{' '}
                {teamDetailModal.coaches.map((c, i) => (
                  <React.Fragment key={`${teamDetailModal.teamId}-${c.email}-${i}`}>
                    {i > 0 ? ', ' : null}
                    {c.email ? (
                      <a href={`mailto:${encodeURIComponent(c.email)}`} className="text-[#0066FF] hover:underline">
                        {c.full_name}
                      </a>
                    ) : (
                      <span>{c.full_name}</span>
                    )}
                  </React.Fragment>
                ))}
              </p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No coach assigned yet.</p>
            )}

            {(() => {
              const starters = teamDetailModal.members.filter((m) => m.lineup_slot != null).sort((a, b) => (a.lineup_slot ?? 0) - (b.lineup_slot ?? 0))
              const bench = teamDetailModal.members.filter((m) => m.lineup_slot == null).slice().sort(sortName)

              const row = (m: TeamRosterMember, role: 'starter' | 'bench' | 'member') => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.profile?.full_name ?? 'Teammate'}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {[m.jersey_number ? `#${m.jersey_number}` : null, m.position?.trim() || null].filter(Boolean).join(' · ') ||
                        '—'}
                    </p>
                  </div>
                  <Badge variant={role === 'starter' ? 'success' : role === 'bench' ? 'default' : 'info'} size="sm">
                    {role === 'starter'
                      ? `Starting (${m.lineup_slot})`
                      : role === 'bench'
                        ? 'Bench'
                        : 'Roster'}
                  </Badge>
                </li>
              )

              if (starters.length === 0) {
                return (
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">
                      Starting lineup has not been assigned yet. Everyone is listed as roster until your organizer sets lineup slots.
                    </p>
                    <ul className="list-none m-0 p-0">{bench.map((m) => row(m, 'member'))}</ul>
                  </div>
                )
              }

              return (
                <>
                  <div>
                    <p className="text-sm font-semibold mb-2">Starting lineup</p>
                    <ul className="list-none m-0 p-0">{starters.map((m) => row(m, 'starter'))}</ul>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-2">Bench</p>
                    {bench.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No bench players listed.</p>
                    ) : (
                      <ul className="list-none m-0 p-0">{bench.map((m) => row(m, 'bench'))}</ul>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </Modal>

      <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0066FF]" />
              Season stats
            </h2>
            {seasonSelectOptions.length > 0 && selectedSeasonId && (
              <div className="w-full sm:w-72 shrink-0">
                <Select
                  label="Season"
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(e.target.value)}
                  options={seasonSelectOptions}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            Totals for the selected season. Tap <span className="text-[var(--text-secondary)]">Games Played</span> for the full
            schedule including past games and your box scores. Recent finished games also appear above under Recent results.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
            ) : selectedSeasonStats ? (
              <>
                <StatCard
                  label="Games Played"
                  value={selectedSeasonStats.games_played}
                  onClick={() => setStatDrilldown('games')}
                  interactiveHint="Tap for schedule"
                />
                {athlete.sport === 'basketball' && (
                  <>
                    <StatCard
                      label="PPG"
                      value={
                        selectedSeasonStats.games_played > 0
                          ? ((selectedSeasonStats.stats?.total_points ?? 0) / selectedSeasonStats.games_played).toFixed(1)
                          : '0.0'
                      }
                      onClick={() => setStatDrilldown('ppg')}
                      interactiveHint="Tap for game log"
                    />
                    <StatCard
                      label="RPG"
                      value={
                        selectedSeasonStats.games_played > 0
                          ? ((selectedSeasonStats.stats?.total_rebounds ?? 0) / selectedSeasonStats.games_played).toFixed(1)
                          : '0.0'
                      }
                      onClick={() => setStatDrilldown('rpg')}
                      interactiveHint="Tap for game log"
                    />
                    <StatCard
                      label="APG"
                      value={
                        selectedSeasonStats.games_played > 0
                          ? ((selectedSeasonStats.stats?.total_assists ?? 0) / selectedSeasonStats.games_played).toFixed(1)
                          : '0.0'
                      }
                      onClick={() => setStatDrilldown('apg')}
                      interactiveHint="Tap for game log"
                    />
                  </>
                )}
                {athlete.sport === 'volleyball' && (
                  <>
                    <StatCard
                      label="Kills"
                      value={selectedSeasonStats.stats?.kills ?? 0}
                      onClick={() => setStatDrilldown('kills')}
                      interactiveHint="Tap for game log"
                    />
                    <StatCard
                      label="Aces"
                      value={selectedSeasonStats.stats?.aces ?? 0}
                      onClick={() => setStatDrilldown('aces')}
                      interactiveHint="Tap for game log"
                    />
                    <StatCard
                      label="Digs"
                      value={selectedSeasonStats.stats?.digs ?? 0}
                      onClick={() => setStatDrilldown('digs')}
                      interactiveHint="Tap for game log"
                    />
                  </>
                )}
                {athlete.sport === 'table-tennis' && (
                  <>
                    <StatCard
                      label="Matches Won"
                      value={selectedSeasonStats.stats?.mw ?? 0}
                      onClick={() => setStatDrilldown('mw')}
                      interactiveHint="Tap for detail"
                    />
                    <StatCard
                      label="Win %"
                      value={`${selectedSeasonStats.stats?.win_pct ?? 0}%`}
                      onClick={() => setStatDrilldown('win_pct')}
                      interactiveHint="Tap for detail"
                    />
                    <StatCard
                      label="Sets Won"
                      value={selectedSeasonStats.stats?.sets_won ?? 0}
                      onClick={() => setStatDrilldown('sets_won')}
                      interactiveHint="Tap for detail"
                    />
                  </>
                )}
              </>
            ) : (
              <div className="col-span-full text-center text-[var(--text-muted)] py-8 text-sm">
                No stats recorded yet for any season.
              </div>
            )}
          </div>
      </div>

      <Modal
        open={statDrilldown !== null}
        onClose={() => {
          setStatDrilldown(null)
          setGameDetailMatchId(null)
        }}
        title={
          statDrilldown === 'games'
            ? `Games — ${seasonDetailTitle}`
            : statDrilldown === 'ppg'
              ? `Points per game — ${seasonDetailTitle}`
              : statDrilldown === 'rpg'
                ? `Rebounds per game — ${seasonDetailTitle}`
                : statDrilldown === 'apg'
                  ? `Assists per game — ${seasonDetailTitle}`
                  : statDrilldown === 'kills'
                    ? `Kills by game — ${seasonDetailTitle}`
                    : statDrilldown === 'aces'
                      ? `Aces by game — ${seasonDetailTitle}`
                      : statDrilldown === 'digs'
                        ? `Digs by game — ${seasonDetailTitle}`
                        : statDrilldown === 'mw'
                          ? `Match wins — ${seasonDetailTitle}`
                          : statDrilldown === 'win_pct'
                            ? `Win percentage — ${seasonDetailTitle}`
                            : statDrilldown === 'sets_won'
                              ? `Sets won — ${seasonDetailTitle}`
                              : 'Stats detail'
        }
        size="lg"
      >
        {statDrilldown === 'games' && (
          <div className="space-y-6 text-sm">
            <p className="text-xs text-[var(--text-muted)]">Tap a match for team totals by quarter or set, opponents, and your logged stats.</p>
            {gamesLogLoading ? (
              <p className="text-[var(--text-muted)]">Loading schedule…</p>
            ) : (
              <>
                {gamesScheduleBuckets.live.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2 flex items-center gap-2">
                      <Badge variant="danger" size="sm">
                        Live now
                      </Badge>
                    </p>
                    <ul className="space-y-2 list-none m-0 p-0">
                      {gamesScheduleBuckets.live.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setGameDetailMatchId(m.id)}
                            className="w-full text-left rounded-lg border border-[var(--border-subtle)] p-3 hover:border-[#0066FF]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{m.event?.name ?? 'Event'}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                  vs {scheduleOpponentLabel(m, myTeamIds, scheduleParticipantLabels)}
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                  {m.scheduled_at ? formatDateTime(m.scheduled_at) : 'Time TBD'}
                                  {m.venue ? ` · ${m.venue}` : ''}
                                </p>
                              </div>
                              <ChevronRight className="w-5 h-5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="font-semibold mb-2">Upcoming</p>
                  {gamesScheduleBuckets.upcoming.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm">No bracket matches in this season for your team yet.</p>
                  ) : (
                    <ul className="space-y-2 list-none m-0 p-0">
                      {gamesScheduleBuckets.upcoming.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setGameDetailMatchId(m.id)}
                            className="w-full text-left rounded-lg border border-[var(--border-subtle)] p-3 hover:border-[#0066FF]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{m.event?.name ?? 'Event'}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                  vs {scheduleOpponentLabel(m, myTeamIds, scheduleParticipantLabels)}
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                  {m.scheduled_at ? formatDateTime(m.scheduled_at) : 'Time TBD'}
                                  {m.venue ? ` · ${m.venue}` : ''}
                                </p>
                              </div>
                              <div className="flex items-start gap-2 shrink-0">
                                <Badge size="sm" variant="info">
                                  {formatEnumLabel(m.status)}
                                </Badge>
                                <ChevronRight className="w-5 h-5 text-[var(--text-muted)] mt-0.5" />
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="font-semibold mb-2">Past games</p>
                  {gamesScheduleBuckets.past.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm">No completed matches yet in this season.</p>
                  ) : (
                    <ul className="space-y-2 list-none m-0 p-0">
                      {gamesScheduleBuckets.past.map((m) => {
                        const box = seasonGamesLog.statsByMatchId[m.id]
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => setGameDetailMatchId(m.id)}
                              className="w-full text-left rounded-lg border border-[var(--border-subtle)] p-3 hover:border-[#0066FF]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{m.event?.name ?? 'Event'}</p>
                                  <p className="text-xs text-[var(--text-muted)] mt-1">
                                    vs {scheduleOpponentLabel(m, myTeamIds, scheduleParticipantLabels)}
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)] mt-1">
                                    {m.scheduled_at ? formatDateTime(m.scheduled_at) : 'Date TBD'}
                                    {m.venue ? ` · ${m.venue}` : ''}
                                  </p>
                                  {box && Object.keys(box).length > 0 ? (
                                    <p className="text-xs text-[var(--text-secondary)] mt-2">Your box score is logged for this match.</p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge size="sm" variant={m.status === 'cancelled' ? 'default' : 'success'}>
                                    {formatEnumLabel(m.status)}
                                  </Badge>
                                  <ChevronRight className="w-5 h-5 text-[var(--text-muted)]" />
                                </div>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {statDrilldown &&
          statDrilldown !== 'games' &&
          (() => {
            const col =
              statDrilldown === 'ppg'
                ? { header: 'PTS', pick: (s: Record<string, number>) => Math.round(s.total_points ?? 0) }
                : statDrilldown === 'rpg'
                  ? { header: 'REB', pick: (s: Record<string, number>) => Math.round(s.total_rebounds ?? 0) }
                  : statDrilldown === 'apg'
                    ? { header: 'AST', pick: (s: Record<string, number>) => Math.round(s.total_assists ?? 0) }
                    : statDrilldown === 'kills'
                      ? { header: 'Kills', pick: (s: Record<string, number>) => Math.round(s.kills ?? 0) }
                      : statDrilldown === 'aces'
                        ? { header: 'Aces', pick: (s: Record<string, number>) => Math.round(s.aces ?? 0) }
                        : statDrilldown === 'digs'
                          ? { header: 'Digs', pick: (s: Record<string, number>) => Math.round(s.digs ?? 0) }
                          : statDrilldown === 'sets_won'
                            ? { header: 'Sets won', pick: (s: Record<string, number>) => Math.round(s.sets_won ?? 0) }
                            : null

            if (statDrilldown === 'win_pct') {
              const gp = selectedSeasonStats?.games_played ?? 0
              const pct = selectedSeasonStats?.stats?.win_pct ?? 0
              return (
                <div className="space-y-3 text-sm">
                  <p className="text-[var(--text-secondary)]">
                    Win percentage is computed across your logged matches this season ({gp} games recorded in totals).
                  </p>
                  <p className="font-medium">{pct}%</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Per-match scoring contributions (points scored) are listed below when available.
                  </p>
                  {matchesWithBoxScores.length === 0 ? (
                    <p className="text-[var(--text-muted)]">No per-match stat rows yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-elevated)] text-left text-xs uppercase text-[var(--text-muted)]">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Event</th>
                            <th className="px-3 py-2 text-right">Pts scored</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchesWithBoxScores.map((m) => (
                            <tr key={m.id} className="border-t border-[var(--border-subtle)]">
                              <td className="px-3 py-2 whitespace-nowrap">
                                {m.scheduled_at ? formatDateTime(m.scheduled_at) : '—'}
                              </td>
                              <td className="px-3 py-2">{m.event?.name ?? '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {Math.round(seasonGamesLog.statsByMatchId[m.id]?.pts_scored ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            }

            if (statDrilldown === 'mw') {
              const mw = selectedSeasonStats?.stats?.mw ?? 0
              return (
                <div className="space-y-3 text-sm">
                  <p className="text-[var(--text-secondary)]">
                    Match wins count toward your season totals after competition results are finalized. Your organizer maintains the official record for standings.
                  </p>
                  <p className="font-medium">Matches won (season total): {mw}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Where scoring actions were logged for you, points scored per match are shown below as activity context.
                  </p>
                  {matchesWithBoxScores.length === 0 ? (
                    <p className="text-[var(--text-muted)]">No per-match stat rows yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-elevated)] text-left text-xs uppercase text-[var(--text-muted)]">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Event</th>
                            <th className="px-3 py-2 text-right">Pts scored</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchesWithBoxScores.map((m) => (
                            <tr key={m.id} className="border-t border-[var(--border-subtle)]">
                              <td className="px-3 py-2 whitespace-nowrap">
                                {m.scheduled_at ? formatDateTime(m.scheduled_at) : '—'}
                              </td>
                              <td className="px-3 py-2">{m.event?.name ?? '—'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {Math.round(seasonGamesLog.statsByMatchId[m.id]?.pts_scored ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            }

            if (!col) return null

            if (matchesWithBoxScores.length === 0) {
              return <p className="text-sm text-[var(--text-muted)]">No per-game stat rows for this season yet.</p>
            }

            const total = matchesWithBoxScores.reduce((acc, m) => acc + Number(col.pick(seasonGamesLog.statsByMatchId[m.id] ?? {})), 0)
            const denom = matchesWithBoxScores.length

            return (
              <div className="space-y-3 text-sm">
                <p className="text-[var(--text-secondary)]">
                  Season card averages use official totals divided by games played. Below is each match where your box score was logged
                  ({denom} {denom === 1 ? 'game' : 'games'}).
                </p>
                <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-elevated)] text-left text-xs uppercase text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2 text-right">{col.header}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchesWithBoxScores.map((m) => (
                        <tr key={m.id} className="border-t border-[var(--border-subtle)]">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {m.scheduled_at ? formatDateTime(m.scheduled_at) : '—'}
                          </td>
                          <td className="px-3 py-2">{m.event?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {col.pick(seasonGamesLog.statsByMatchId[m.id] ?? {})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Sum across listed games: <span className="text-[var(--text-secondary)] font-medium">{total}</span>
                  {denom > 0 &&
                  statDrilldown !== 'sets_won' &&
                  (
                    statDrilldown === 'ppg' ||
                    statDrilldown === 'rpg' ||
                    statDrilldown === 'apg' ||
                    statDrilldown === 'kills' ||
                    statDrilldown === 'aces' ||
                    statDrilldown === 'digs'
                  ) ? (
                    <> · Mean across these logged games: {(total / denom).toFixed(1)}</>
                  ) : null}
                </p>
              </div>
            )
          })()}
      </Modal>

      <Modal
        open={selectedGameDetailMatch !== null}
        onClose={() => setGameDetailMatchId(null)}
        title={selectedGameDetailMatch ? `${selectedGameDetailMatch.event?.name ?? 'Event'} · Game detail` : ''}
        size="lg"
        layer="nested"
      >
        {selectedGameDetailMatch &&
          (() => {
            const m = selectedGameDetailMatch
            const sport = (m.event?.sport ?? athlete.sport) as string
            const scores = seasonGamesLog.scoresByMatchId[m.id] ?? []
            const { sa, sb } = pickScoresForMatch(m.participant_a_id, m.participant_b_id, scores)
            const nameA = m.participant_a_id ? scheduleParticipantLabels[m.participant_a_id] ?? 'Side A' : 'TBD'
            const nameB = m.participant_b_id ? scheduleParticipantLabels[m.participant_b_id] ?? 'Side B' : 'TBD'
            const mySide =
              m.participant_a_id && myTeamIds.includes(m.participant_a_id)
                ? 'a'
                : m.participant_b_id && myTeamIds.includes(m.participant_b_id)
                  ? 'b'
                  : null
            const statRows = formatAthleteMatchStats(sport, seasonGamesLog.statsByMatchId[m.id])
            const hasBoard = scores.length > 0

            const teamBadge = (side: 'a' | 'b') =>
              mySide === side ? (
                <Badge variant="info" size="sm" className="ml-2 align-middle">
                  Your team
                </Badge>
              ) : null

            let scoreSection: React.ReactNode = null
            if (!hasBoard) {
              scoreSection = (
                <p className="text-[var(--text-muted)] text-sm">
                  Team scores will show here once the organizer logs scoring for this match.
                </p>
              )
            } else if (sport === 'basketball') {
              const tot = (sc: Partial<MatchScore> | undefined) =>
                sc?.total != null ? Number(sc.total) : bbTeamTotal(sc)
              scoreSection = (
                <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="bg-[var(--surface-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        <th className="px-3 py-2 text-left">Team</th>
                        <th className="px-2 py-2 text-right tabular-nums">Q1</th>
                        <th className="px-2 py-2 text-right tabular-nums">Q2</th>
                        <th className="px-2 py-2 text-right tabular-nums">Q3</th>
                        <th className="px-2 py-2 text-right tabular-nums">Q4</th>
                        <th className="px-2 py-2 text-right tabular-nums">OT</th>
                        <th className="px-2 py-2 text-right tabular-nums font-semibold">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['a', nameA, sa],
                        ['b', nameB, sb],
                      ] as const).map(([side, label, sc]) => (
                        <tr key={side} className="border-t border-[var(--border-subtle)]">
                          <td className="px-3 py-2">
                            <span className="font-medium">{label}</span>
                            {teamBadge(side)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{Number(sc?.q1 ?? 0)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{Number(sc?.q2 ?? 0)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{Number(sc?.q3 ?? 0)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{Number(sc?.q4 ?? 0)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{Number(sc?.ot ?? 0)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">{tot(sc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            } else if (sport === 'volleyball') {
              scoreSection = (
                <>
                  <p className="text-sm font-medium">
                    Sets won:{' '}
                    <span className="tabular-nums">
                      {Number(sa?.sets_won ?? 0)} – {Number(sb?.sets_won ?? 0)}
                    </span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] mt-2">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="bg-[var(--surface-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          <th className="px-3 py-2 text-left">Team</th>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <th key={n} className="px-2 py-2 text-right tabular-nums">
                              Set {n}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          ['a', nameA, sa],
                          ['b', nameB, sb],
                        ] as const).map(([side, label, sc]) => (
                          <tr key={side} className="border-t border-[var(--border-subtle)]">
                            <td className="px-3 py-2">
                              <span className="font-medium">{label}</span>
                              {teamBadge(side)}
                            </td>
                            {(['set1', 'set2', 'set3', 'set4', 'set5'] as const).map((k) => (
                              <td key={k} className="px-2 py-2 text-right tabular-nums">
                                {Number(sc?.[k] ?? 0)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            } else if (sport === 'table-tennis') {
              scoreSection = (
                <>
                  <p className="text-sm font-medium">
                    Games won:{' '}
                    <span className="tabular-nums">
                      {Number(sa?.games_won ?? 0)} – {Number(sb?.games_won ?? 0)}
                    </span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] mt-2">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="bg-[var(--surface-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          <th className="px-3 py-2 text-left">Side</th>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <th key={n} className="px-2 py-2 text-right tabular-nums">
                              G{n}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          ['a', nameA, sa],
                          ['b', nameB, sb],
                        ] as const).map(([side, label, sc]) => (
                          <tr key={side} className="border-t border-[var(--border-subtle)]">
                            <td className="px-3 py-2">
                              <span className="font-medium">{label}</span>
                              {teamBadge(side)}
                            </td>
                            {(['game1', 'game2', 'game3', 'game4', 'game5'] as const).map((k) => (
                              <td key={k} className="px-2 py-2 text-right tabular-nums">
                                {Number(sc?.[k] ?? 0)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            } else {
              scoreSection = (
                <p className="text-[var(--text-muted)] text-sm">
                  Score breakdown is not available for this sport in the app yet.
                </p>
              )
            }

            return (
              <div className="space-y-5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={m.status === 'live' ? 'danger' : m.status === 'scheduled' ? 'info' : 'success'} size="sm">
                    {formatEnumLabel(m.status)}
                  </Badge>
                  <span className="text-[var(--text-muted)]">
                    {getSportIcon(sport as any)} {getSportLabel(sport as any)}
                  </span>
                </div>
                <p className="text-[var(--text-muted)] text-xs">
                  {m.scheduled_at ? formatDateTime(m.scheduled_at) : 'Date TBD'}
                  {m.venue ? ` · ${m.venue}` : ''}
                </p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Matchup</p>
                  <p>
                    <span className="font-medium">{nameA}</span>
                    <span className="text-[var(--text-muted)] mx-2">vs</span>
                    <span className="font-medium">{nameB}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Team totals</p>
                  {scoreSection}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Your stats</p>
                  {statRows.length === 0 ? (
                    <p className="text-[var(--text-muted)] text-sm">
                      No personal stats were logged for you in this match yet.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 list-none m-0 p-0">
                      {statRows.map((row) => (
                        <li
                          key={row.key}
                          className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 bg-[var(--surface-elevated)]/40"
                        >
                          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">{row.label}</p>
                          <p className="text-lg font-semibold tabular-nums">{row.value}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {m.event_id ? (
                  <div className="pt-2 flex flex-wrap gap-2 justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const ev = m.event_id
                        setGameDetailMatchId(null)
                        setStatDrilldown(null)
                        openEventDetail(ev)
                      }}
                    >
                      Open event
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })()}
      </Modal>

      {insights.length > 0 && (
        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0066FF]" />
            Performance Insights
          </h2>
          <div className="space-y-2">
            {insights.map((i) => (
              <Card key={i.id} className="flex items-center gap-3">
                {i.insight_type === 'trending_up' || i.insight_type === 'debut_standout' || i.insight_type === 'first_win' ? (
                  <TrendingUp className="w-5 h-5 text-[var(--success)]" />
                ) : i.insight_type === 'trending_down' ? (
                  <TrendingDown className="w-5 h-5 text-[#FF3355]" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-[#FFB800]" />
                )}
                <p className="text-sm">{i.insight_text}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={showPasswordNudge} onClose={() => setShowPasswordNudge(false)} title="Update your password" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            You&apos;re still using the password set for you when your account was created. For security, we recommend
            changing it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPasswordNudge(false)}>
              Later
            </Button>
            <Button
              onClick={() => {
                setShowPasswordNudge(false)
                navigate('/athlete/settings')
              }}
            >
              Change password
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
