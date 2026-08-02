import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { liveScorePresentation } from '../../lib/liveMatchPresentation'
import { useTimerListener } from '../../hooks/useGameTimer'

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
})

const BB_PERIOD_KEYS = ['q1', 'q2', 'q3', 'q4', 'ot', 'ot2', 'ot3'] as const
const TT_PERIOD_KEYS = ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7'] as const
const VB_PERIOD_KEYS = ['set1', 'set2', 'set3', 'set4', 'set5'] as const

/** Sum of period boxes — increases on rally points; used for flash + works for BB / VB / TT */
function aggregatePeriodPoints(sc: Partial<ScoreState>, sport: string): number {
  if (sport === 'basketball') {
    return BB_PERIOD_KEYS.reduce((acc, k) => acc + Number(sc[k] ?? 0), 0)
  }
  if (sport === 'volleyball') {
    return VB_PERIOD_KEYS.reduce((acc, k) => acc + Number(sc[k] ?? 0), 0)
  }
  if (sport === 'table-tennis') {
    return TT_PERIOD_KEYS.reduce((acc, k) => acc + Number(sc[k] ?? 0), 0)
  }
  return 0
}

type ScoreRow = ScoreState & { participant_id: string }

function mergeScoreRow(raw: Record<string, unknown>): ScoreRow {
  return { ...emptyScore(), ...raw } as ScoreRow
}

/** Q1-Q4 always shown — basketball always plays all 4 regulation quarters, so
 *  these are never "unplayed" in a completed game. OT columns only appear
 *  once either side has scored in them. */
function basketballPeriodColumns(scoreA: ScoreState, scoreB: ScoreState) {
  const base = ['q1', 'q2', 'q3', 'q4'] as const
  const otKeys = ['ot', 'ot2', 'ot3'] as const
  const otVisible = otKeys.filter((k) => scoreA[k] > 0 || scoreB[k] > 0)
  return [...base, ...otVisible].map((key, i) => ({
    key,
    label: i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `OT${i - 3}`,
  }))
}

/** Show a set/game column once it's been scored in, or — while the match is
 *  still live — it's the one currently being played. Unlike basketball, a
 *  volleyball or table-tennis match can (and usually does) end before every
 *  set/game slot is used, so trailing untouched slots stay hidden instead of
 *  sitting there as a permanent "0". The `isDone` guard matters because the
 *  server auto-advances current_period past the decisive set/game once it's
 *  validated (e.g. to 4 after a 3-0 sweep) and nothing ever resets it back
 *  down afterward — trusting currentPeriod once the match is completed would
 *  bring right back the phantom empty box this is meant to remove. */
function playedOrCurrentColumns(
  keys: readonly string[],
  labelPrefix: string,
  scoreA: ScoreState,
  scoreB: ScoreState,
  currentPeriod: number,
  isDone: boolean,
) {
  let last = 0
  keys.forEach((k, i) => {
    const key = k as keyof ScoreState
    const played = scoreA[key] > 0 || scoreB[key] > 0
    const isCurrent = !isDone && i + 1 === currentPeriod
    if (played || isCurrent) last = i
  })
  return keys.slice(0, last + 1).map((key, i) => ({ key, label: `${labelPrefix}${i + 1}` }))
}

function volleyballPeriodColumns(scoreA: ScoreState, scoreB: ScoreState, currentPeriod: number, isDone: boolean) {
  return playedOrCurrentColumns(VB_PERIOD_KEYS, 'S', scoreA, scoreB, currentPeriod, isDone)
}

function tableTennisPeriodColumns(scoreA: ScoreState, scoreB: ScoreState, currentPeriod: number, isDone: boolean) {
  return playedOrCurrentColumns(TT_PERIOD_KEYS, 'G', scoreA, scoreB, currentPeriod, isDone)
}

export default function JumbotronPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { institution } = useInstitutionStore()
  const [match, setMatch] = useState<any>(null)
  const [scoreA, setScoreA] = useState<ScoreState>(emptyScore())
  const [scoreB, setScoreB] = useState<ScoreState>(emptyScore())
  const [sport, setSport] = useState('basketball')
  const [currentPeriod, setCurrentPeriod] = useState(1)
  const [teamAName, setTeamAName] = useState('HOME')
  const [teamBName, setTeamBName] = useState('AWAY')
  const [flash, setFlash] = useState<'A' | 'B' | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Seeds the clock from the last persisted snapshot (migration 055) so a
  // board that loads before the scorer's next tick still shows the real time
  // instead of just "VS" — see useGameTimer.ts.
  const persistedClock = match
    ? {
        seconds: match.clock_seconds ?? null,
        running: !!match.clock_running,
        shotClockSeconds: match.shot_clock_seconds ?? null,
        shotClockRunning: !!match.shot_clock_running,
        updatedAt: match.clock_updated_at ?? null,
      }
    : null
  const { timerState, formatTime } = useTimerListener(matchId ?? '', sport === 'basketball', persistedClock, 'countdown')

  const participantARef = useRef<string | null>(null)
  const participantBRef = useRef<string | null>(null)
  const sportRef = useRef(sport)

  useEffect(() => {
    sportRef.current = sport
  }, [sport])

  const triggerFlash = useCallback((side: 'A' | 'B') => {
    setFlash(side)
    setTimeout(() => setFlash(null), 600)
  }, [])

  // Read the period the scorer is actually on. This used to be inferred from
  // the most recent scoring_action, so the board kept showing the previous set
  // until the first point of the new one landed.
  const fetchCurrentPeriod = useCallback(async () => {
    if (!matchId) return
    const { data } = await supabase
      .from('matches')
      .select('current_period')
      .eq('id', matchId)
      .maybeSingle()
    if (data?.current_period != null) {
      setCurrentPeriod(Math.min(Math.max(Number(data.current_period), 1), 7))
    }
  }, [matchId])

  const loadMatch = useCallback(async () => {
    if (!matchId) return
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle()
    if (!match) {
      setNotFound(true)
      return
    }
    setNotFound(false)
    setMatch(match)

    participantARef.current = match.participant_a_id ?? null
    participantBRef.current = match.participant_b_id ?? null

    let sportResolved = 'basketball'
    if (match.event_id) {
      const { data: event } = await supabase.from('events').select('sport').eq('id', match.event_id).maybeSingle()
      if (event?.sport) sportResolved = event.sport
    }
    setSport(sportResolved)

    const { data: scores } = await supabase.from('match_scores').select('*').eq('match_id', matchId)
    if (scores) {
      const sA = scores.find((s: any) => s.participant_id === match.participant_a_id)
      const sB = scores.find((s: any) => s.participant_id === match.participant_b_id)
      if (sA) setScoreA(mergeScoreRow(sA as Record<string, unknown>))
      if (sB) setScoreB(mergeScoreRow(sB as Record<string, unknown>))
    }

    if (match.participant_a_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', match.participant_a_id).maybeSingle()
      if (team) setTeamAName(team.name)
    }
    if (match.participant_b_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', match.participant_b_id).maybeSingle()
      if (team) setTeamBName(team.name)
    }

    await fetchCurrentPeriod()
  }, [matchId, fetchCurrentPeriod])

  useEffect(() => {
    loadMatch()
    const sp = sportRef.current
    const channel = supabase
      .channel(`jumbotron-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_scores', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const ns = mergeScoreRow(payload.new as Record<string, unknown>)
          const spNow = sportRef.current
          if (ns.participant_id === participantARef.current) {
            setScoreA((prev) => {
              if (aggregatePeriodPoints(ns, spNow) > aggregatePeriodPoints(prev, spNow)) triggerFlash('A')
              return ns
            })
          } else {
            setScoreB((prev) => {
              if (aggregatePeriodPoints(ns, spNow) > aggregatePeriodPoints(prev, spNow)) triggerFlash('B')
              return ns
            })
          }
          void fetchCurrentPeriod()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => {
        void loadMatch()
        // current_period lives on matches, so a period change now reaches the
        // board immediately instead of waiting for the next point.
        void fetchCurrentPeriod()
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [matchId, loadMatch, triggerFlash, fetchCurrentPeriod])

  const pres = liveScorePresentation(sport, scoreA, scoreB, currentPeriod)
  const isLive = match?.status === 'live'
  const isDone = match?.status === 'completed'

  const bbColumns = sport === 'basketball' ? basketballPeriodColumns(scoreA, scoreB) : []
  const vbColumns = sport === 'volleyball' ? volleyballPeriodColumns(scoreA, scoreB, currentPeriod, isDone) : []
  const ttColumns = sport === 'table-tennis' ? tableTennisPeriodColumns(scoreA, scoreB, currentPeriod, isDone) : []

  const sportLabel = sport.replace(/-/g, ' ').toUpperCase()

  if (notFound) {
    return (
      <div
        className="min-h-screen w-full flex flex-col items-center justify-center gap-3 select-none"
        style={{ background: 'linear-gradient(180deg, #000510 0%, #00103A 100%)', fontFamily: '"Barlow Condensed", sans-serif' }}
      >
        <p className="text-white/40 text-2xl tracking-widest">MATCH NOT FOUND</p>
        <p className="text-white/25 text-sm">This match link is invalid or the match no longer exists.</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col select-none overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #000510 0%, #00103A 100%)', fontFamily: '"Barlow Condensed", sans-serif' }}
    >
      <div
        className="flex items-center justify-between px-10 py-4 border-b-2"
        style={{ borderColor: 'var(--school-secondary, #FFD700)', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center gap-4">
          {institution?.logo_url ? (
            <img src={institution.logo_url} alt="Logo" className="w-12 h-12 rounded-full" />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ backgroundColor: 'var(--school-secondary, #FFD700)', color: 'var(--school-primary, #002D62)' }}
            >
              🏆
            </div>
          )}
          <div>
            <p className="text-white font-black text-xl tracking-widest">{institution?.abbreviation ?? 'U-Sports'}</p>
            <p className="text-white/50 text-sm">{institution?.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-right">
          <p className="text-white/60 text-sm uppercase tracking-wider">{sportLabel}</p>
          {isLive && (
            <div className="flex items-center gap-2 bg-red-600 px-4 py-1.5 rounded-full">
              <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse-live" />
              <span className="font-black tracking-widest text-white text-sm">LIVE</span>
            </div>
          )}
          {isDone && (
            <div className="flex items-center gap-2 bg-green-800 px-4 py-1.5 rounded-full">
              <span className="font-black tracking-widest text-[var(--success)] text-sm">FINAL</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-white/50 text-sm uppercase tracking-widest pt-4">{pres.phase}</p>
      {(sport === 'volleyball' || sport === 'table-tennis') && (
        <p className="text-center text-white/40 text-sm font-medium pb-2">{pres.subtitle}</p>
      )}

      <div className="flex-1 flex items-center justify-center px-10">
        <div className="w-full max-w-6xl">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-8 items-center">
            <div
              className={`text-center transition-all duration-300 ${flash === 'A' ? 'scale-105' : ''}`}
              style={{ filter: flash === 'A' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '' }}
            >
              <p className="text-white/50 text-lg uppercase tracking-widest mb-2">HOME</p>
              <p
                className="font-black uppercase tracking-wide leading-none mb-2"
                style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', color: 'var(--school-secondary, #FFD700)' }}
              >
                {teamAName}
              </p>
              <p
                className="font-black leading-none"
                style={{
                  fontSize: 'clamp(5rem, 18vw, 14rem)',
                  color: flash === 'A' ? 'var(--school-secondary, #FFD700)' : '#FFFFFF',
                  textShadow: flash === 'A' ? '0 0 40px rgba(255, 215, 0, 0.8)' : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {pres.left}
              </p>

              {sport === 'basketball' && (
                <div className="flex justify-center gap-4 mt-4">
                  {bbColumns.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg">{scoreA[key]}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'volleyball' && (
                <div className="flex justify-center gap-3 mt-4">
                  {vbColumns.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg">{scoreA[key as keyof ScoreState]}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'table-tennis' && (
                <div className="flex justify-center gap-3 mt-4">
                  {ttColumns.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg">{scoreA[key]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-px h-16 bg-white/10" />
              {timerState ? (
                <div className="text-center">
                  <p className="text-white font-mono font-black text-3xl tabular-nums tracking-wider">
                    {formatTime(timerState.seconds)}
                  </p>
                  {sport === 'basketball' && timerState.shotClockSeconds != null && (
                    <p
                      className={`font-mono font-bold text-lg tabular-nums mt-1 ${timerState.shotClockSeconds <= 5 ? 'text-[#FF3355]' : 'text-white/60'}`}
                    >
                      {String(timerState.shotClockSeconds).padStart(2, '0')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-white/30 text-2xl font-black">VS</p>
              )}
              <div className="w-px h-16 bg-white/10" />
            </div>

            <div
              className={`text-center transition-all duration-300 ${flash === 'B' ? 'scale-105' : ''}`}
              style={{ filter: flash === 'B' ? 'drop-shadow(0 0 30px var(--school-secondary, #FFD700))' : '' }}
            >
              <p className="text-white/50 text-lg uppercase tracking-widest mb-2">AWAY</p>
              <p
                className="font-black uppercase tracking-wide leading-none mb-2"
                style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', color: 'var(--school-secondary, #FFD700)' }}
              >
                {teamBName}
              </p>
              <p
                className="font-black leading-none"
                style={{
                  fontSize: 'clamp(5rem, 18vw, 14rem)',
                  color: flash === 'B' ? 'var(--school-secondary, #FFD700)' : '#FFFFFF',
                  textShadow: flash === 'B' ? '0 0 40px rgba(255, 215, 0, 0.8)' : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                {pres.right}
              </p>

              {sport === 'basketball' && (
                <div className="flex justify-center gap-4 mt-4">
                  {bbColumns.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg">{scoreB[key]}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'volleyball' && (
                <div className="flex justify-center gap-3 mt-4">
                  {vbColumns.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg">{scoreB[key as keyof ScoreState]}</p>
                    </div>
                  ))}
                </div>
              )}

              {sport === 'table-tennis' && (
                <div className="flex justify-center gap-3 mt-4">
                  {ttColumns.map(({ key, label }) => (
                    <div key={key} className="text-center">
                      <p className="text-white/30 text-xs mb-0.5">{label}</p>
                      <p className="text-white font-bold text-lg">{scoreB[key]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sport === 'basketball' && (
            <p className="text-center text-white/35 text-xs mt-6">{pres.subtitle}</p>
          )}

          {isDone && (
            <div className="text-center mt-8">
              <p className="text-[var(--success)] text-3xl font-black tracking-widest animate-pulse-live">GAME OVER</p>
            </div>
          )}
        </div>
      </div>

      <div
        className="px-10 py-3 border-t flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <p className="text-white/30 text-sm">U-Sports Platform · {institution?.name}</p>
        {match?.venue && <p className="text-white/30 text-sm">{match.venue}</p>}
        <p className="text-white/20 text-xs font-mono">{matchId?.slice(0, 8)}</p>
      </div>
    </div>
  )
}
