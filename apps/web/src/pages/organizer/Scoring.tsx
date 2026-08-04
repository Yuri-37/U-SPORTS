import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Play, Square, Tv2, AlertTriangle, ArrowLeft, Timer, Shuffle, Lock } from 'lucide-react'
import { Button, Card, Badge, Alert, Modal, Select } from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { useGameTimer } from '../../hooks/useGameTimer'
import { useMatchPresence } from '../../hooks/useMatchPresence'
import { cn } from '../../lib/utils'
import type { Match } from '../../types'
import MatchPresenceAvatars from '../../components/scoring/MatchPresenceAvatars'
import MatchActivityFeed from '../../components/scoring/MatchActivityFeed'

interface ScoreState {
  q1: number
  q2: number
  q3: number
  q4: number
  ot: number
  ot2: number
  ot3: number
  set1: number
  set2: number
  set3: number
  set4: number
  set5: number
  sets_won: number
  game1: number
  game2: number
  game3: number
  game4: number
  game5: number
  game6: number
  game7: number
  games_won: number
  total: number
}

/** Mirrors GET /:matchId/state's new fields (apps/server/src/routes/scoring.ts). */
interface MatchDecision {
  decided: boolean
  winnerParticipantId: string | null
  winsA: number
  winsB: number
  needsOvertime: boolean
  reason: string
}
interface BasketballInfo {
  teamFouls: Record<string, number>
  bonus: Record<string, boolean>
  fouledOut: string[]
}
interface SubTimeoutInfo {
  subsUsed: Record<string, number>
  timeouts: Record<string, number>
}
interface GameLimits {
  personalFouls: number
  teamFoulBonus: number
  subsPerSet: number
  timeoutsPerSetVB: number
  timeoutsPerMatchTT: number
}

/** Live stat buttons. `key` must match ALLOWED_ACTIONS in apps/server/src/routes/scoring.ts. */
const BASKETBALL_STATS = [
  { key: 'rebound', label: 'DREB', title: 'Defensive rebound' },
  { key: 'off_rebound', label: 'OREB', title: 'Offensive rebound' },
  { key: 'assist', label: 'AST', title: 'Assist' },
  { key: 'steal', label: 'STL', title: 'Steal' },
  { key: 'block', label: 'BLK', title: 'Block' },
  { key: 'turnover', label: 'TO', title: 'Turnover' },
  { key: 'foul', label: 'FOUL', title: 'Personal foul' },
] as const

const BASKETBALL_MISSES = [
  { key: 'miss_1', label: 'FT', title: 'Missed free throw' },
  { key: 'miss_2', label: '2PT', title: 'Missed 2-point attempt' },
  { key: 'miss_3', label: '3PT', title: 'Missed 3-point attempt' },
] as const

const VOLLEYBALL_STATS = [
  { key: 'kill', label: 'Kill', title: 'Kill — wins the rally' },
  { key: 'ace', label: 'Ace', title: 'Service ace — wins the rally' },
  { key: 'block', label: 'Block', title: 'Blocked for a point' },
  { key: 'dig', label: 'Dig', title: 'Dig (no point)' },
  { key: 'assist', label: 'Set', title: 'Set assist (no point)' },
  { key: 'error', label: 'Err', title: 'Attack error — point to the opponent' },
  { key: 'serve_error', label: 'Srv Err', title: 'Service error — point to the opponent' },
  { key: 'reception_error', label: 'Rcv Err', title: 'Reception error — point to the opponent' },
] as const

const TABLE_TENNIS_STATS = [
  { key: 'tt_winner', label: 'Winner', title: 'Rally won outright' },
  { key: 'tt_ace', label: 'Ace', title: 'Service ace' },
  { key: 'tt_error', label: 'Err', title: 'Unforced error — point to the opponent' },
] as const

/** Period labels per sport. Mirrors PERIOD_FIELDS on the server — basketball
 *  supports three overtimes and table tennis is best-of-7 capable. */
function periodConfigFor(sport: string): { label: string; periods: string[] } {
  if (sport === 'volleyball') return { label: 'Set', periods: ['S1', 'S2', 'S3', 'S4', 'S5'] }
  if (sport === 'table-tennis')
    return { label: 'Game', periods: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'] }
  return { label: 'Period', periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT2', 'OT3'] }
}

/** Per-period values for the score strip. Trailing periods that were never
 *  played (extra overtimes, games 6-7) are hidden so the strip stays compact. */
function periodValuesFor(score: ScoreState, sport: string): { label: string; value: number }[] {
  const { periods } = periodConfigFor(sport)
  const raw =
    sport === 'volleyball'
      ? [score.set1, score.set2, score.set3, score.set4, score.set5]
      : sport === 'table-tennis'
        ? [
            score.game1,
            score.game2,
            score.game3,
            score.game4,
            score.game5,
            score.game6,
            score.game7,
          ]
        : [score.q1, score.q2, score.q3, score.q4, score.ot, score.ot2, score.ot3]
  const alwaysShown = sport === 'basketball' ? 4 : 5
  let last = raw.length - 1
  while (last >= alwaysShown && !raw[last]) last--
  return raw
    .slice(0, Math.max(alwaysShown, last + 1))
    .map((value, i) => ({ label: periods[i] ?? '', value }))
}

interface TeamMember {
  id: string
  athlete_id: string | null
  lineup_slot?: number | null
  athlete: { id: string; profile: { full_name: string } | null } | null
}

const emptyScore = (): ScoreState => ({
  q1: 0,
  q2: 0,
  q3: 0,
  q4: 0,
  ot: 0,
  ot2: 0,
  ot3: 0,
  set1: 0,
  set2: 0,
  set3: 0,
  set4: 0,
  set5: 0,
  sets_won: 0,
  game1: 0,
  game2: 0,
  game3: 0,
  game4: 0,
  game5: 0,
  game6: 0,
  game7: 0,
  games_won: 0,
  total: 0,
})

function mergeScore(base: ScoreState, raw: Record<string, unknown> | null | undefined): ScoreState {
  if (!raw) return base
  return { ...base, ...raw } as ScoreState
}

export default function OrganizerScoring() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { user, profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)

  const [match, setMatch] = useState<Match | null>(null)
  const [scoreA, setScoreA] = useState<ScoreState>(emptyScore())
  const [scoreB, setScoreB] = useState<ScoreState>(emptyScore())
  const [sport, setSport] = useState('basketball')
  // Mirror of matches.current_period. The server owns this — it is refreshed by
  // loadState() so a refresh or a second scorer can never desync the period.
  const [currentPeriod, setCurrentPeriod] = useState(1)
  const [lockedPeriods, setLockedPeriods] = useState<number[]>([])
  const [periodBusy, setPeriodBusy] = useState(false)
  // Explicit confirmation for the validate action — the score display resetting
  // to 0 for the next period looked like a bug with nothing explaining it.
  const [validateSuccess, setValidateSuccess] = useState<{
    label: string
    scoreA: number
    scoreB: number
    nextLabel: string | null
  } | null>(null)
  const validateSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [lockWarning, setLockWarning] = useState<{ name: string } | null>(null)
  const [clockLockWarning, setClockLockWarning] = useState<{ name: string } | null>(null)
  const [dismissedScoringHandoff, setDismissedScoringHandoff] = useState(false)
  const [dismissedClockHandoff, setDismissedClockHandoff] = useState(false)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endConfirm, setEndConfirm] = useState(false)
  const [clockEditing, setClockEditing] = useState(false)
  const [clockEditValue, setClockEditValue] = useState('')
  const [shotClockEditing, setShotClockEditing] = useState(false)
  const [shotClockEditValue, setShotClockEditValue] = useState('')
  const [winnerId, setWinnerId] = useState('')
  const [error, setError] = useState('')
  const [recentActions, setRecentActions] = useState<any[]>([])
  const [nameA, setNameA] = useState('Home')
  const [nameB, setNameB] = useState('Away')
  const [teamStats, setTeamStats] = useState<Record<string, Record<string, number>>>({})
  const [eventStatus, setEventStatus] = useState<string>('')

  // Player selector state
  const [membersA, setMembersA] = useState<TeamMember[]>([])
  const [membersB, setMembersB] = useState<TeamMember[]>([])
  const [selectedPlayerA, setSelectedPlayerA] = useState<string>('')
  const [selectedPlayerB, setSelectedPlayerB] = useState<string>('')

  // Active lineup (seeded from match.active_lineup)
  const [activeLineupA, setActiveLineupA] = useState<string[]>([])
  const [activeLineupB, setActiveLineupB] = useState<string[]>([])

  // Sub modal state
  const [subModal, setSubModal] = useState<{ side: 'a' | 'b'; outId: string } | null>(null)
  const [subInId, setSubInId] = useState('')
  const [subBusy, setSubBusy] = useState(false)

  // Game-flow rule enforcement (warn, never block) — all derived server-side,
  // refreshed by loadState().
  const [matchDecision, setMatchDecision] = useState<MatchDecision | null>(null)
  const [serveInfo, setServeInfo] = useState<{
    servingParticipantId: string | null
    source: string
  } | null>(null)
  const [basketballInfo, setBasketballInfo] = useState<BasketballInfo | null>(null)
  const [volleyballInfo, setVolleyballInfo] = useState<SubTimeoutInfo | null>(null)
  const [tableTennisInfo, setTableTennisInfo] = useState<{
    timeouts: Record<string, number>
  } | null>(null)
  const [gameLimits, setGameLimits] = useState<GameLimits | null>(null)
  const [firstServerBusy, setFirstServerBusy] = useState(false)
  const [foulOutConfirm, setFoulOutConfirm] = useState<{
    athleteId: string
    name: string
    onConfirm: () => void
  } | null>(null)

  const participantAId = match?.participant_a_id ?? ''
  const participantBId = match?.participant_b_id ?? ''

  // Is this organizer the current scoring lock holder?
  const isLockHolder = !!match?.scoring_locked_by && match.scoring_locked_by === user?.id
  // Clock control is independent of the scoring lock — a different organizer
  // can hold it, so a second person can run the clock while someone else scores.
  const clockHeldByOther = !!match?.clock_locked_by && match.clock_locked_by !== user?.id

  // Single presence subscription, shared by the header avatars, the activity
  // feed, and the auto-disconnect handoff prompt below.
  const { online, disconnectedHolder } = useMatchPresence({
    matchId,
    scopedProfile,
    scoringLockHolderId: match?.scoring_locked_by ?? null,
    clockLockHolderId: match?.clock_locked_by ?? null,
  })
  // A dismissal only covers the disconnect that prompted it — a fresh one
  // (holder reconnects, then drops again; or the lock changes hands) should
  // surface the prompt again rather than staying silenced for the rest of the
  // page's life. Adjusted during render (React's documented pattern for
  // resetting state on a prop/derived-value change — see "Adjusting state
  // when a prop changes" in the React docs) rather than in an effect, so
  // there's no extra render cycle; a ref can't be used here since refs must
  // not be read/written during render.
  const [prevDisconnected, setPrevDisconnected] = useState(disconnectedHolder)
  if (disconnectedHolder !== prevDisconnected) {
    if (disconnectedHolder.scoring && !prevDisconnected.scoring) {
      setDismissedScoringHandoff(false)
    }
    if (disconnectedHolder.clock && !prevDisconnected.clock) {
      setDismissedClockHandoff(false)
    }
    setPrevDisconnected(disconnectedHolder)
  }

  const timerMode = sport === 'basketball' ? ('countdown' as const) : ('stopwatch' as const)
  const quarterMinutes = 10
  const timerEnabled = sport === 'basketball'
  const timer = useGameTimer({
    matchId: matchId ?? '',
    mode: timerMode,
    initialSeconds: quarterMinutes * 60,
    enabled: timerEnabled,
    onPersistError: (err) => {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (code === 'CLOCK_LOCKED') {
        const lockedBy = (err as { response?: { data?: { lockedBy?: string } } })?.response?.data
          ?.lockedBy
        setClockLockWarning({ name: lockedBy ?? 'Another organizer' })
      }
      void loadState()
    },
  })

  const statFor = (pid: string, key: string) => teamStats[pid]?.[key] ?? 0

  const loadTeamMembers = useCallback(async (participantId: string): Promise<TeamMember[]> => {
    if (!participantId) return []
    try {
      const { data } = await api.get(`/teams/${participantId}`)
      if (
        data?.members &&
        Array.isArray(data.members) &&
        (data.members as TeamMember[]).length > 0
      ) {
        return data.members as TeamMember[]
      }
    } catch {
      // Participant is not a team — try individual athlete
    }

    const { data: solo } = await supabase
      .from('athletes')
      .select('id, profile:profiles!athletes_profile_id_fkey(full_name)')
      .eq('id', participantId)
      .maybeSingle()

    if (solo?.id) {
      return [
        {
          id: `athlete:${solo.id}`,
          athlete_id: solo.id,
          athlete: solo as unknown as TeamMember['athlete'],
        },
      ]
    }

    return []
  }, [])

  const loadState = useCallback(async () => {
    if (!matchId) return
    const { data } = await api.get(`/scoring/${matchId}/state`)
    if (!data) return
    setMatch(data.match)
    setIsLive(data.match?.status === 'live')
    setRecentActions(data.recentActions ?? [])
    setTeamStats(data.teamStats ?? {})
    // Server is the source of truth for the live period and which are frozen.
    setCurrentPeriod(Number(data.currentPeriod ?? data.match?.current_period ?? 1))
    setLockedPeriods((data.lockedPeriods ?? []) as number[])
    const pn = data.participantNames as { a?: string; b?: string } | undefined
    if (pn?.a) setNameA(pn.a)
    if (pn?.b) setNameB(pn.b)

    const scores = (data.scores ?? []) as Array<{ participant_id?: string }>
    const sA = scores.find((s) => s.participant_id === data.match?.participant_a_id)
    const sB = scores.find((s) => s.participant_id === data.match?.participant_b_id)
    setScoreA(mergeScore(emptyScore(), sA as any))
    setScoreB(mergeScore(emptyScore(), sB as any))

    const lineup = data.match?.active_lineup as { a?: string[]; b?: string[] } | null
    setActiveLineupA(lineup?.a ?? [])
    setActiveLineupB(lineup?.b ?? [])

    setMatchDecision((data.matchDecision as MatchDecision) ?? null)
    setServeInfo((data.serve as { servingParticipantId: string | null; source: string }) ?? null)
    setBasketballInfo((data.basketball as BasketballInfo) ?? null)
    setVolleyballInfo((data.volleyball as SubTimeoutInfo) ?? null)
    setTableTennisInfo((data.tableTennis as { timeouts: Record<string, number> }) ?? null)
    setGameLimits((data.limits as GameLimits) ?? null)

    if (data.match?.event_id) {
      const { data: event } = await supabase
        .from('events')
        .select('sport, status')
        .eq('id', data.match.event_id)
        .maybeSingle()
      if (event) {
        setSport(event.sport)
        setEventStatus(event.status ?? '')
      }
    }
  }, [matchId])

  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const REALTIME_STATE_DEBOUNCE_MS = 400

  const scheduleRealtimeStateReload = useCallback(() => {
    if (realtimeReloadTimerRef.current != null) clearTimeout(realtimeReloadTimerRef.current)
    realtimeReloadTimerRef.current = setTimeout(() => {
      realtimeReloadTimerRef.current = null
      void loadState()
    }, REALTIME_STATE_DEBOUNCE_MS)
  }, [loadState])

  useEffect(() => {
    loadState()
    const channel = supabase
      .channel(`scoring-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_scores',
          filter: `match_id=eq.${matchId}`,
        },
        () => scheduleRealtimeStateReload(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        () => scheduleRealtimeStateReload(),
      )
      .subscribe()
    return () => {
      if (realtimeReloadTimerRef.current != null) {
        clearTimeout(realtimeReloadTimerRef.current)
        realtimeReloadTimerRef.current = null
      }
      if (validateSuccessTimerRef.current != null) {
        clearTimeout(validateSuccessTimerRef.current)
        validateSuccessTimerRef.current = null
      }
      channel.unsubscribe()
    }
  }, [matchId, loadState, scheduleRealtimeStateReload])

  // Load team members whenever participants are known
  useEffect(() => {
    if (participantAId) {
      loadTeamMembers(participantAId).then(setMembersA)
    }
    if (participantBId) {
      loadTeamMembers(participantBId).then(setMembersB)
    }
  }, [participantAId, participantBId, loadTeamMembers])

  // Restore the game clock from the last persisted snapshot (migration 055)
  // as soon as the match loads — a reload used to silently reset it to a
  // fresh 10:00 quarter. hydrate() only acts on its first call, so this is
  // safe to leave depending on `match` even though loadState() re-runs it
  // on every realtime update.
  const { hydrate: hydrateTimer } = timer
  useEffect(() => {
    if (!match) return
    hydrateTimer({
      seconds: match.clock_seconds ?? null,
      running: !!match.clock_running,
      shotClockSeconds: match.shot_clock_seconds ?? null,
      shotClockRunning: !!match.shot_clock_running,
      updatedAt: match.clock_updated_at ?? null,
    })
  }, [match, hydrateTimer])

  // Checked after every hook above has run (never before) so the hook call
  // order never changes between renders — doing this before the hooks used to
  // crash the page the moment `scopedProfile` resolved to 'Coach' on a render
  // after the first, since React had already recorded a longer hook list.
  if (scopedProfile?.role === 'Coach') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <p className="text-lg font-semibold">Live scoring is not available for coaches.</p>
        <p className="text-sm text-[var(--text-muted)]">
          Coaches manage rosters and lineups — scoring is handled by organizers.
        </p>
        <Button variant="secondary" onClick={() => navigate('/organizer/teams')}>
          Go to Teams
        </Button>
      </div>
    )
  }

  const handleStart = async () => {
    setStarting(true)
    setError('')
    try {
      await api.post(`/scoring/${matchId}/start`)
      await loadState()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string; lockedBy?: string } } }
      if (ax.response?.data?.error === 'SCORING_LOCKED') {
        setLockWarning({ name: ax.response.data.lockedBy ?? 'Another organizer' })
      } else {
        setError(ax.response?.data?.error ?? 'Failed to start match')
      }
    } finally {
      setStarting(false)
    }
  }

  const handleSub = async () => {
    if (!subModal || !subInId) return
    setSubBusy(true)
    try {
      await api.patch(`/scoring/${matchId}/lineup`, {
        side: subModal.side,
        outAthleteId: subModal.outId,
        inAthleteId: subInId,
      })
      await loadState()
      setSubModal(null)
      setSubInId('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Sub failed')
    } finally {
      setSubBusy(false)
    }
  }

  const handleAction = async (
    participantId: string,
    actionType: string,
    value: number = 1,
    athleteId?: string,
  ) => {
    try {
      setError('')
      await api.post(`/scoring/${matchId}/action`, {
        participantId,
        actionType,
        value,
        quarterOrSet: currentPeriod,
        sport,
        ...(athleteId ? { athleteId } : {}),
      })
      await loadState()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Action failed')
      // A 409 means our period drifted from the server's — resync immediately.
      await loadState()
    }
  }

  const handleChangePeriod = async (period: number) => {
    if (period === currentPeriod) return
    setPeriodBusy(true)
    setError('')
    if (validateSuccessTimerRef.current) clearTimeout(validateSuccessTimerRef.current)
    setValidateSuccess(null)
    try {
      await api.patch(`/scoring/${matchId}/period`, { period })
      await loadState()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Could not change period')
      await loadState()
    } finally {
      setPeriodBusy(false)
    }
  }

  const handleValidatePeriod = async () => {
    setPeriodBusy(true)
    setError('')
    if (validateSuccessTimerRef.current) clearTimeout(validateSuccessTimerRef.current)
    setValidateSuccess(null)
    const validatedPeriod = currentPeriod
    try {
      const res = await api.post<{ score_a: number; score_b: number; advanced_to: number | null }>(
        `/scoring/${matchId}/period/${currentPeriod}/validate`,
      )
      await loadState()

      const { periods } = periodConfigFor(sport)
      const label = periods[validatedPeriod - 1] ?? `Period ${validatedPeriod}`
      const nextLabel =
        res.data.advanced_to != null ? (periods[res.data.advanced_to - 1] ?? null) : null

      setValidateSuccess({ label, scoreA: res.data.score_a, scoreB: res.data.score_b, nextLabel })
      validateSuccessTimerRef.current = setTimeout(() => setValidateSuccess(null), 8000)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Could not validate this period')
    } finally {
      setPeriodBusy(false)
    }
  }

  const handleSetFirstServer = async (participantId: string) => {
    setFirstServerBusy(true)
    setError('')
    try {
      await api.patch(`/scoring/${matchId}/first-server`, { participantId })
      await loadState()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Could not set first server')
    } finally {
      setFirstServerBusy(false)
    }
  }

  const applyClockEdit = () => {
    const trimmed = clockEditValue.trim()
    const m = trimmed.match(/^(\d{1,2}):(\d{2})$/)
    if (m) {
      const mins = parseInt(m[1]!, 10)
      const secs = parseInt(m[2]!, 10)
      if (secs < 60) timer.setMainClock(mins * 60 + secs)
    }
    setClockEditing(false)
  }

  const applyShotClockEdit = () => {
    const trimmed = shotClockEditValue.trim()
    if (/^\d{1,2}$/.test(trimmed)) timer.setShotClock(parseInt(trimmed, 10))
    setShotClockEditing(false)
  }

  const handleUndo = async (scoringParticipantId: string) => {
    try {
      await api.post(`/scoring/${matchId}/undo`, { scoringParticipantId })
      await loadState()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Undo failed')
    }
  }

  const handleEnd = async () => {
    if (!winnerId) return
    setEnding(true)
    try {
      await api.post(`/scoring/${matchId}/end`, { winnerId })
      navigate(`/organizer/match-review/${matchId}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Failed to end match')
    } finally {
      setEnding(false)
    }
  }

  const getMainDisplay = (score: ScoreState) => {
    if (sport === 'basketball') {
      return score.q1 + score.q2 + score.q3 + score.q4 + score.ot + score.ot2 + score.ot3
    }
    if (sport === 'volleyball') {
      const sets = [score.set1, score.set2, score.set3, score.set4, score.set5]
      return sets[currentPeriod - 1] ?? 0
    }
    if (sport === 'table-tennis') {
      const games = [
        score.game1,
        score.game2,
        score.game3,
        score.game4,
        score.game5,
        score.game6,
        score.game7,
      ]
      return games[currentPeriod - 1] ?? 0
    }
    return 0
  }

  const subTotalLine =
    sport === 'basketball'
      ? `Total ${getMainDisplay(scoreA)} – ${getMainDisplay(scoreB)} (game)`
      : sport === 'volleyball'
        ? `Sets won ${scoreA.sets_won} – ${scoreB.sets_won}`
        : `Games won ${scoreA.games_won} – ${scoreB.games_won}`

  // Render stat buttons for a given side (select player pills, then tap a stat counter)
  const renderStatButtons = (
    participantId: string,
    side: 'a' | 'b',
    selectedPlayer: string,
    setSelectedPlayer: (v: string) => void,
    members: TeamMember[],
    activeIds: string[],
  ) => {
    const sortedMembers = [...members].sort((a, b) => {
      const sa = typeof a.lineup_slot === 'number' ? a.lineup_slot : 999
      const sb = typeof b.lineup_slot === 'number' ? b.lineup_slot : 999
      if (sa !== sb) return sa - sb
      return (a.athlete?.profile?.full_name ?? '').localeCompare(
        b.athlete?.profile?.full_name ?? '',
      )
    })

    const activeMembersFiltered =
      activeIds.length > 0
        ? sortedMembers.filter((m) => m.athlete?.id && activeIds.includes(m.athlete.id))
        : sortedMembers.filter((m) => m.athlete?.id)

    const lineupForSubs = side === 'a' ? activeLineupA : activeLineupB

    const doStat = (actionType: string, value = 1) => {
      // Foul-out is a warning, not a block — confirm rather than silently record.
      if (
        sport === 'basketball' &&
        selectedPlayer &&
        basketballInfo?.fouledOut.includes(selectedPlayer)
      ) {
        const name =
          sortedMembers.find((m) => m.athlete?.id === selectedPlayer)?.athlete?.profile
            ?.full_name ?? 'This player'
        setFoulOutConfirm({
          athleteId: selectedPlayer,
          name,
          onConfirm: () => {
            setFoulOutConfirm(null)
            handleAction(participantId, actionType, value, selectedPlayer)
          },
        })
        return
      }
      handleAction(participantId, actionType, value, selectedPlayer || undefined)
    }

    return (
      <div className="space-y-2 mt-2">
        {activeMembersFiltered.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--text-muted)]">Choose a player, then tap a stat</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {activeMembersFiltered.map((m) => {
                const aid = m.athlete!.id
                const fullName = m.athlete?.profile?.full_name ?? `Athlete ${aid.slice(0, 6)}`
                const shortLabel = fullName.split(/\s+/)[0] ?? fullName
                const isSelected = selectedPlayer === aid
                const showSub = lineupForSubs.length > 0 && lineupForSubs.includes(aid)
                const isFouledOut =
                  sport === 'basketball' && !!basketballInfo?.fouledOut.includes(aid)

                return (
                  <span
                    key={aid}
                    className={cn(
                      'inline-flex rounded-full overflow-hidden border text-xs',
                      isSelected
                        ? 'border-[#0066FF] ring-1 ring-[#0066FF]/40'
                        : isFouledOut
                          ? 'border-[var(--danger)]/50'
                          : 'border-[var(--border-subtle)]',
                    )}
                  >
                    <button
                      type="button"
                      title={
                        isFouledOut ? `${fullName} has fouled out (5 personal fouls)` : undefined
                      }
                      onClick={() => setSelectedPlayer(isSelected ? '' : aid)}
                      className={cn(
                        'px-2.5 py-1 max-w-[9rem] truncate font-medium transition-colors',
                        isSelected
                          ? 'bg-[var(--accent-default)]/20 text-[var(--text-primary)]'
                          : isFouledOut
                            ? 'bg-[var(--danger)]/10 text-[var(--danger)]'
                            : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {isFouledOut ? `⚠ ${shortLabel}` : shortLabel}
                    </button>
                    {showSub && (
                      <button
                        type="button"
                        aria-label={`Substitute ${fullName}`}
                        onClick={() => {
                          setSubModal({ side, outId: aid })
                          setSubInId('')
                        }}
                        className="flex items-center justify-center px-1.5 border-l border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                      >
                        <Shuffle className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {sport === 'basketball' && (
          <div className="space-y-1.5">
            <div className="flex justify-center gap-1.5 flex-wrap">
              {BASKETBALL_STATS.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant="secondary"
                  title={s.title}
                  disabled={!selectedPlayer}
                  onClick={() => doStat(s.key)}
                >
                  {s.label} ({statFor(participantId, s.key)})
                </Button>
              ))}
            </div>
            {/* Missed attempts — without these FG%, 3P% and FT% cannot be computed. */}
            <div className="flex justify-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] self-center mr-1">
                Missed
              </span>
              {BASKETBALL_MISSES.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant="secondary"
                  title={s.title}
                  disabled={!selectedPlayer}
                  onClick={() => doStat(s.key)}
                >
                  {s.label} ({statFor(participantId, s.key)})
                </Button>
              ))}
            </div>
          </div>
        )}

        {sport === 'volleyball' && (
          <div className="flex justify-center gap-1.5 flex-wrap">
            {VOLLEYBALL_STATS.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant="secondary"
                title={s.title}
                disabled={!selectedPlayer}
                onClick={() => doStat(s.key)}
              >
                {s.label} ({statFor(participantId, s.key)})
              </Button>
            ))}
          </div>
        )}

        {sport === 'table-tennis' && (
          <div className="flex justify-center gap-1.5 flex-wrap">
            {TABLE_TENNIS_STATS.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant="secondary"
                title={s.title}
                disabled={!selectedPlayer}
                onClick={() => doStat(s.key)}
              >
                {s.label} ({statFor(participantId, s.key)})
              </Button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Live Scoring</h1>
          <p className="text-[var(--text-muted)] text-xs truncate">
            {nameA} vs {nameB}
          </p>
        </div>
        <div className="flex-1" />
        {isLive && (
          <MatchPresenceAvatars
            online={online}
            scoringLockHolderId={match?.scoring_locked_by ?? null}
            clockLockHolderId={match?.clock_locked_by ?? null}
          />
        )}
        {isLive && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse-live" />
            <Badge variant="danger">LIVE</Badge>
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={<Tv2 className="w-3.5 h-3.5" />}
          onClick={() => window.open(`/jumbotron/${matchId}`, '_blank')}
        >
          Jumbotron
        </Button>
      </div>

      {error && (
        <Alert type="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {lockWarning && (
        <Alert type="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{lockWarning.name} is currently scoring this match. Forcefully taking over?</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={async () => {
                await api.post(`/scoring/${matchId}/transfer-lock`)
                setLockWarning(null)
                loadState()
              }}
            >
              Take Over
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setLockWarning(null)}>
              Cancel
            </Button>
          </div>
        </Alert>
      )}

      {clockLockWarning && (
        <Alert type="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{clockLockWarning.name} controls the game clock. Take over?</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={async () => {
                await api.post(`/scoring/${matchId}/clock/transfer-lock`)
                setClockLockWarning(null)
                loadState()
              }}
            >
              Take Clock Control
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setClockLockWarning(null)}>
              Cancel
            </Button>
          </div>
        </Alert>
      )}

      {isLive && disconnectedHolder.scoring && !dismissedScoringHandoff && (
        <Alert type="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>The organizer scoring this match appears to have disconnected.</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={async () => {
                await api.post(`/scoring/${matchId}/transfer-lock`)
                setDismissedScoringHandoff(true)
                loadState()
              }}
            >
              Claim Scoring Control
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDismissedScoringHandoff(true)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      {isLive && disconnectedHolder.clock && !dismissedClockHandoff && (
        <Alert type="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>The organizer running the clock appears to have disconnected.</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              onClick={async () => {
                await api.post(`/scoring/${matchId}/clock/transfer-lock`)
                setDismissedClockHandoff(true)
                loadState()
              }}
            >
              Claim Clock Control
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDismissedClockHandoff(true)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      {isLive && !isLockHolder && (
        <Alert type="info">
          <span className="font-medium">Stat Tracker Mode</span> — another organizer holds the
          scoring lock. You can record team and player stats but cannot award points.
        </Alert>
      )}

      {isLive && matchDecision?.decided && (
        <Alert type="success">
          <span className="font-semibold">
            {matchDecision.winnerParticipantId === participantAId ? nameA : nameB} wins{' '}
            {Math.max(matchDecision.winsA, matchDecision.winsB)}–
            {Math.min(matchDecision.winsA, matchDecision.winsB)}
          </span>
          {' — '}
          {matchDecision.reason}.
          {isLockHolder && (
            <Button
              size="sm"
              className="ml-3"
              onClick={() => {
                setWinnerId(matchDecision.winnerParticipantId ?? '')
                setEndConfirm(true)
              }}
            >
              End Match
            </Button>
          )}
        </Alert>
      )}

      {isLive && sport === 'basketball' && matchDecision?.needsOvertime && (
        <Alert type="warning">Tied after regulation — the game needs overtime.</Alert>
      )}

      <p className="text-xs text-[var(--text-muted)] text-center">{subTotalLine}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* HOME team card */}
        <Card className="text-center" elevated>
          <p className="text-xs text-[var(--text-muted)] mb-1">HOME</p>
          <p className="text-lg font-semibold mb-1 truncate px-1">{nameA}</p>
          <div className="min-h-[20px] mb-1">
            {sport === 'basketball' && basketballInfo?.bonus.a && (
              <span title={`${basketballInfo.teamFouls.a ?? 0} team fouls this quarter`}>
                <Badge variant="danger" size="sm">
                  BONUS
                </Badge>
              </span>
            )}
          </div>
          <p className="text-6xl font-black font-[Barlow_Condensed] text-[var(--text-primary)] mb-4">
            {getMainDisplay(scoreA)}
          </p>

          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] mb-4">
            {periodValuesFor(scoreA, sport).map((p, i) => (
              <div
                key={p.label}
                className={cn('min-w-8', lockedPeriods.includes(i + 1) && 'opacity-60')}
              >
                <p className="font-bold flex items-center justify-center gap-0.5">
                  {lockedPeriods.includes(i + 1) && <Lock className="w-2.5 h-2.5" />}
                  {p.label}
                </p>
                <p>{p.value}</p>
              </div>
            ))}
          </div>

          {isLive && (
            <div className="space-y-2">
              {sport === 'basketball' && (
                <div className="flex justify-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    disabled={!isLockHolder || !selectedPlayerA}
                    onClick={() => handleAction(participantAId, 'point_1', 1, selectedPlayerA)}
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    disabled={!isLockHolder || !selectedPlayerA}
                    onClick={() => handleAction(participantAId, 'point_2', 2, selectedPlayerA)}
                  >
                    +2
                  </Button>
                  <Button
                    size="sm"
                    disabled={!isLockHolder || !selectedPlayerA}
                    onClick={() => handleAction(participantAId, 'point_3', 3, selectedPlayerA)}
                  >
                    +3
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!isLockHolder}
                    onClick={() => handleUndo(participantAId)}
                  >
                    −1
                  </Button>
                </div>
              )}
              {sport !== 'basketball' && (
                <div className="flex justify-center gap-2 flex-wrap">
                  {/* Generic point, for a rally won without a specific stat
                      (opponent error, net violation, referee award). */}
                  <Button
                    size="sm"
                    disabled={!isLockHolder}
                    onClick={() =>
                      handleAction(participantAId, 'point_1', 1, selectedPlayerA || undefined)
                    }
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!isLockHolder}
                    onClick={() => handleUndo(participantAId)}
                  >
                    −1
                  </Button>
                </div>
              )}
              {sport === 'basketball' && !selectedPlayerA && (
                <p className="text-xs text-[var(--text-muted)] text-center">
                  Select a player first.
                </p>
              )}
              {renderStatButtons(
                participantAId,
                'a',
                selectedPlayerA,
                setSelectedPlayerA,
                membersA,
                activeLineupA,
              )}
            </div>
          )}
        </Card>

        {/* AWAY team card */}
        <Card className="text-center" elevated>
          <p className="text-xs text-[var(--text-muted)] mb-1">AWAY</p>
          <p className="text-lg font-semibold mb-1 truncate px-1">{nameB}</p>
          <div className="min-h-[20px] mb-1">
            {sport === 'basketball' && basketballInfo?.bonus.b && (
              <span title={`${basketballInfo.teamFouls.b ?? 0} team fouls this quarter`}>
                <Badge variant="danger" size="sm">
                  BONUS
                </Badge>
              </span>
            )}
          </div>
          <p className="text-6xl font-black font-[Barlow_Condensed] text-[var(--text-primary)] mb-4">
            {getMainDisplay(scoreB)}
          </p>

          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] mb-4">
            {periodValuesFor(scoreB, sport).map((p, i) => (
              <div
                key={p.label}
                className={cn('min-w-8', lockedPeriods.includes(i + 1) && 'opacity-60')}
              >
                <p className="font-bold flex items-center justify-center gap-0.5">
                  {lockedPeriods.includes(i + 1) && <Lock className="w-2.5 h-2.5" />}
                  {p.label}
                </p>
                <p>{p.value}</p>
              </div>
            ))}
          </div>

          {isLive && (
            <div className="space-y-2">
              {sport === 'basketball' && (
                <div className="flex justify-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    disabled={!isLockHolder || !selectedPlayerB}
                    onClick={() => handleAction(participantBId, 'point_1', 1, selectedPlayerB)}
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    disabled={!isLockHolder || !selectedPlayerB}
                    onClick={() => handleAction(participantBId, 'point_2', 2, selectedPlayerB)}
                  >
                    +2
                  </Button>
                  <Button
                    size="sm"
                    disabled={!isLockHolder || !selectedPlayerB}
                    onClick={() => handleAction(participantBId, 'point_3', 3, selectedPlayerB)}
                  >
                    +3
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!isLockHolder}
                    onClick={() => handleUndo(participantBId)}
                  >
                    −1
                  </Button>
                </div>
              )}
              {sport !== 'basketball' && (
                <div className="flex justify-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    disabled={!isLockHolder}
                    onClick={() =>
                      handleAction(participantBId, 'point_1', 1, selectedPlayerB || undefined)
                    }
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!isLockHolder}
                    onClick={() => handleUndo(participantBId)}
                  >
                    −1
                  </Button>
                </div>
              )}
              {sport === 'basketball' && !selectedPlayerB && (
                <p className="text-xs text-[var(--text-muted)] text-center">
                  Select a player first.
                </p>
              )}
              {renderStatButtons(
                participantBId,
                'b',
                selectedPlayerB,
                setSelectedPlayerB,
                membersB,
                activeLineupB,
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Game clock — basketball only (VB / TT use set/game scoring, no shot clock) */}
      {isLive && sport === 'basketball' && (
        <Card className="space-y-4">
          {/* Main clock */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Timer className="w-4 h-4 text-[var(--text-muted)]" />
              {clockEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={clockEditValue}
                  onChange={(e) => setClockEditValue(e.target.value)}
                  onBlur={applyClockEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyClockEdit()
                    if (e.key === 'Escape') setClockEditing(false)
                  }}
                  placeholder="MM:SS"
                  maxLength={5}
                  className="w-28 text-3xl font-mono font-bold tabular-nums tracking-wider bg-transparent border-b-2 border-[#0066FF] text-center focus:outline-none"
                />
              ) : (
                <span
                  title={clockHeldByOther ? 'Another organizer controls the clock' : 'Click to edit'}
                  onClick={() => {
                    if (clockHeldByOther) return
                    setClockEditValue(timer.formatTime(timer.seconds))
                    setClockEditing(true)
                  }}
                  className={`text-3xl font-mono font-bold tabular-nums tracking-wider select-none ${clockHeldByOther ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-[var(--accent-default)]'}`}
                >
                  {timer.formatTime(timer.seconds)}
                </span>
              )}
              {timer.running ? (
                <Badge variant="danger" size="sm">
                  Running
                </Badge>
              ) : (
                <Badge variant="default" size="sm">
                  Paused
                </Badge>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {!timer.running ? (
                <Button
                  size="sm"
                  icon={<Play className="w-3 h-3" />}
                  onClick={timer.start}
                  disabled={clockHeldByOther}
                >
                  {timer.seconds === quarterMinutes * 60 ? 'Start' : 'Resume'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Square className="w-3 h-3" />}
                  onClick={timer.pause}
                  disabled={clockHeldByOther}
                >
                  Pause
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => timer.resetMainClock()}
                disabled={clockHeldByOther}
              >
                Reset
              </Button>
            </div>
          </div>

          {/* 24-second shot clock */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Shot Clock
              </span>
              {shotClockEditing ? (
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={shotClockEditValue}
                  onChange={(e) => setShotClockEditValue(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={applyShotClockEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyShotClockEdit()
                    if (e.key === 'Escape') setShotClockEditing(false)
                  }}
                  placeholder="SS"
                  maxLength={2}
                  className="w-12 text-2xl font-mono font-bold tabular-nums bg-transparent border-b-2 border-[#0066FF] text-center focus:outline-none"
                />
              ) : (
                <span
                  title={clockHeldByOther ? 'Another organizer controls the clock' : 'Click to edit'}
                  onClick={() => {
                    if (clockHeldByOther) return
                    setShotClockEditValue(String(timer.shotClockSeconds))
                    setShotClockEditing(true)
                  }}
                  className={`text-2xl font-mono font-bold tabular-nums select-none ${clockHeldByOther ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-[var(--accent-default)]'} ${timer.shotClockSeconds <= 5 ? 'text-[#FF3355]' : 'text-white'}`}
                >
                  {String(timer.shotClockSeconds).padStart(2, '0')}
                </span>
              )}
              {timer.shotClockRunning ? (
                <Badge variant="danger" size="sm">
                  On
                </Badge>
              ) : (
                <Badge variant="default" size="sm">
                  Off
                </Badge>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {!timer.shotClockRunning ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Play className="w-3 h-3" />}
                  onClick={timer.startShotClock}
                  disabled={clockHeldByOther}
                >
                  Start
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Square className="w-3 h-3" />}
                  onClick={timer.pauseShotClock}
                  disabled={clockHeldByOther}
                >
                  Stop
                </Button>
              )}
              <button
                type="button"
                onClick={() => timer.resetShotClock(true)}
                disabled={clockHeldByOther}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                24
              </button>
              <button
                type="button"
                onClick={() => timer.resetShotClock(false)}
                disabled={clockHeldByOther}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                14
              </button>
            </div>
          </div>
          {clockHeldByOther && (
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-[var(--text-muted)]">
                <span className="font-medium">Clock View Only</span> — another organizer controls
                the game clock.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await api.post(`/scoring/${matchId}/clock/transfer-lock`)
                  loadState()
                }}
              >
                Take Clock Control
              </Button>
            </div>
          )}
        </Card>
      )}

      {isLive &&
        (() => {
          const { label, periods } = periodConfigFor(sport)
          const isLocked = (p: number) => lockedPeriods.includes(p)
          const currentIsLocked = isLocked(currentPeriod)
          return (
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">{label}:</span>
                <div className="flex gap-2 flex-wrap">
                  {periods.map((p, i) => {
                    const n = i + 1
                    const locked = isLocked(n)
                    return (
                      <button
                        key={p}
                        type="button"
                        disabled={!isLockHolder || periodBusy || locked}
                        title={locked ? `${p} is validated and locked` : `Switch to ${p}`}
                        onClick={() => void handleChangePeriod(n)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors inline-flex items-center gap-1 disabled:cursor-not-allowed ${
                          currentPeriod === n
                            ? 'bg-[var(--accent-default)] text-white'
                            : locked
                              ? 'bg-[var(--surface-elevated)] text-[var(--text-muted)] opacity-60'
                              : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {locked && <Lock className="w-3 h-3" />}
                        {p}
                      </button>
                    )
                  })}
                </div>
                {isLockHolder && !currentIsLocked && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={periodBusy}
                    icon={<Lock className="w-3.5 h-3.5" />}
                    onClick={() => void handleValidatePeriod()}
                  >
                    Validate {periods[currentPeriod - 1] ?? label}
                  </Button>
                )}
              </div>
              {validateSuccess && (
                <Alert type="success" onDismiss={() => setValidateSuccess(null)}>
                  <span className="font-semibold">{validateSuccess.label} validated</span> — final
                  score {validateSuccess.scoreA}–{validateSuccess.scoreB}, now locked.
                  {validateSuccess.nextLabel
                    ? ` Now scoring ${validateSuccess.nextLabel}.`
                    : ' That was the last period — you can now end the match.'}
                </Alert>
              )}
              {currentIsLocked ? (
                <Alert type="warning">
                  {periods[currentPeriod - 1]} is validated and locked — scores and undo are frozen
                  for it. An admin must reopen it to make changes.
                </Alert>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Validating freezes this {label.toLowerCase()}&apos;s score so it can no longer be
                  edited, then advances to the next one.
                </p>
              )}
            </Card>
          )
        })()}

      {isLive && matchId && (
        <MatchActivityFeed
          matchId={matchId}
          online={online}
          selfId={scopedProfile?.id ?? null}
          selfName={scopedProfile?.full_name ?? null}
          nameA={nameA}
          nameB={nameB}
          participantAId={participantAId}
          participantBId={participantBId}
          currentPeriod={currentPeriod}
          periodLabel={periodConfigFor(sport).label}
          recentActions={recentActions}
          scoringLockedBy={match?.scoring_locked_by ?? null}
          clockLockedBy={match?.clock_locked_by ?? null}
        />
      )}

      {/* Serve tracking + timeouts/subs (volleyball & table tennis only) */}
      {isLive && (sport === 'volleyball' || sport === 'table-tennis') && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Serving:</span>
            {!serveInfo?.servingParticipantId ? (
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-xs text-[var(--text-muted)]">Who serves first?</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!isLockHolder || firstServerBusy}
                  onClick={() => void handleSetFirstServer(participantAId)}
                >
                  {nameA}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!isLockHolder || firstServerBusy}
                  onClick={() => void handleSetFirstServer(participantBId)}
                >
                  {nameB}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-center flex-wrap">
                <Badge variant="info" size="sm">
                  ● {serveInfo.servingParticipantId === participantAId ? nameA : nameB} serving
                </Badge>
                {isLockHolder && (
                  <button
                    type="button"
                    disabled={firstServerBusy}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline disabled:opacity-50"
                    onClick={() =>
                      void handleSetFirstServer(
                        serveInfo.servingParticipantId === participantAId
                          ? participantBId
                          : participantAId,
                      )
                    }
                  >
                    correct it
                  </button>
                )}
              </div>
            )}
          </div>

          {sport === 'volleyball' && volleyballInfo && gameLimits && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>
                {nameA} subs {volleyballInfo.subsUsed.a ?? 0}/{gameLimits.subsPerSet}
                {(volleyballInfo.subsUsed.a ?? 0) >= gameLimits.subsPerSet && (
                  <span className="text-[var(--danger)] ml-1">limit reached</span>
                )}
                {' · '}timeouts {volleyballInfo.timeouts.a ?? 0}/{gameLimits.timeoutsPerSetVB}
              </span>
              <span>
                {nameB} subs {volleyballInfo.subsUsed.b ?? 0}/{gameLimits.subsPerSet}
                {(volleyballInfo.subsUsed.b ?? 0) >= gameLimits.subsPerSet && (
                  <span className="text-[var(--danger)] ml-1">limit reached</span>
                )}
                {' · '}timeouts {volleyballInfo.timeouts.b ?? 0}/{gameLimits.timeoutsPerSetVB}
              </span>
            </div>
          )}
          {sport === 'table-tennis' && tableTennisInfo && gameLimits && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>
                {nameA} timeouts {tableTennisInfo.timeouts.a ?? 0}/{gameLimits.timeoutsPerMatchTT}
              </span>
              <span>
                {nameB} timeouts {tableTennisInfo.timeouts.b ?? 0}/{gameLimits.timeoutsPerMatchTT}
              </span>
            </div>
          )}

          <div className="flex justify-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!isLockHolder}
              onClick={() => void handleAction(participantAId, 'timeout')}
            >
              {nameA} timeout
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!isLockHolder}
              onClick={() => void handleAction(participantBId, 'timeout')}
            >
              {nameB} timeout
            </Button>
          </div>
        </Card>
      )}

      {/* Box Score */}
      {isLive &&
        (participantAId || participantBId) &&
        (() => {
          const statKeys: { key: string; label: string }[] =
            sport === 'basketball'
              ? [...BASKETBALL_STATS, ...BASKETBALL_MISSES].map((s) => ({
                  key: s.key,
                  label: s.label,
                }))
              : sport === 'volleyball'
                ? VOLLEYBALL_STATS.map((s) => ({ key: s.key, label: s.label }))
                : TABLE_TENNIS_STATS.map((s) => ({ key: s.key, label: s.label }))
          const hasAny = statKeys.some(
            (s) => statFor(participantAId, s.key) > 0 || statFor(participantBId, s.key) > 0,
          )
          if (!hasAny) return null
          return (
            <Card>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Box Score
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-muted)] text-xs">
                      <th className="text-left py-1 pr-3">Stat</th>
                      <th className="text-center py-1 px-2">{nameA}</th>
                      <th className="text-center py-1 px-2">{nameB}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statKeys.map((s) => (
                      <tr key={s.key} className="border-t border-[var(--border-subtle)]">
                        <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{s.label}</td>
                        <td className="py-1.5 px-2 text-center font-medium">
                          {statFor(participantAId, s.key)}
                        </td>
                        <td className="py-1.5 px-2 text-center font-medium">
                          {statFor(participantBId, s.key)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })()}

      <Card className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {!isLive ? (
            eventStatus === 'in_progress' ? (
              <Button icon={<Play className="w-4 h-4" />} loading={starting} onClick={handleStart}>
                Start Match
              </Button>
            ) : (
              <span className="text-sm text-[var(--text-muted)]">
                Start the event first before scoring this match.
              </span>
            )
          ) : (
            <>
              {isLockHolder && (
                <Button
                  variant="danger"
                  icon={<Square className="w-4 h-4" />}
                  onClick={() => setEndConfirm(true)}
                  size="sm"
                >
                  End Match
                </Button>
              )}
              {!isLockHolder && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await api.post(`/scoring/${matchId}/transfer-lock`)
                    await loadState()
                  }}
                >
                  Take Scoring Lock
                </Button>
              )}
            </>
          )}
        </div>
        {recentActions.length > 0 && (
          <div className="text-xs text-[var(--text-muted)] text-right max-w-[55%]">
            Last: {recentActions[0]?.action_type} ({recentActions[0]?.value > 0 ? '+' : ''}
            {recentActions[0]?.value})
          </div>
        )}
      </Card>

      {/* Fouled-out confirmation — warn, don't block */}
      {foulOutConfirm && (
        <Modal
          open={!!foulOutConfirm}
          onClose={() => setFoulOutConfirm(null)}
          title="Player has fouled out"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text-primary)]">{foulOutConfirm.name}</strong> already
              has {gameLimits?.personalFouls ?? 5}+ personal fouls. Record this stat anyway?
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setFoulOutConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={foulOutConfirm.onConfirm}>
                Record Anyway
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sub / Substitution modal */}
      {subModal && (
        <Modal open={!!subModal} onClose={() => setSubModal(null)} title="Substitution">
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              Replacing{' '}
              <strong className="text-[var(--text-primary)]">
                {(subModal.side === 'a' ? membersA : membersB).find(
                  (m) => m.athlete?.id === subModal.outId,
                )?.athlete?.profile?.full_name ?? subModal.outId.slice(0, 8)}
              </strong>{' '}
              — choose the player coming in from the bench.
            </p>
            <Select
              label="Sub in"
              value={subInId}
              onChange={(e) => setSubInId(e.target.value)}
              options={[
                { value: '', label: 'Select player…' },
                ...(subModal.side === 'a' ? membersA : membersB)
                  .filter((m) => {
                    if (!m.athlete?.id) return false
                    const lineup = subModal.side === 'a' ? activeLineupA : activeLineupB
                    return !lineup.includes(m.athlete.id)
                  })
                  .map((m) => ({
                    value: m.athlete!.id,
                    label: m.athlete?.profile?.full_name ?? m.athlete_id?.slice(0, 8) ?? '?',
                  })),
              ]}
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setSubModal(null)}>
                Cancel
              </Button>
              <Button loading={subBusy} disabled={!subInId} onClick={handleSub}>
                Confirm Sub
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal open={endConfirm} onClose={() => setEndConfirm(false)} title="End Match">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Select the winner to officially end this match.
          </p>
          <Select
            label="Winner"
            value={winnerId}
            onChange={(e) => setWinnerId(e.target.value)}
            options={[
              { value: '', label: 'Select winner...' },
              { value: participantAId, label: nameA },
              { value: participantBId, label: nameB },
            ]}
          />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setEndConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={ending} onClick={handleEnd} disabled={!winnerId}>
              Confirm End Match
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
