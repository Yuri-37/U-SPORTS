import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

export type TimerMode = 'countdown' | 'stopwatch'

export interface TimerState {
  /** Remaining seconds (countdown) or elapsed seconds (stopwatch) */
  seconds: number
  running: boolean
  shotClockSeconds: number
  shotClockRunning: boolean
}

/** matches.clock_* as returned by GET /:matchId/state — see migration 055. */
export interface PersistedClockState {
  seconds: number | null
  running: boolean
  shotClockSeconds: number | null
  shotClockRunning: boolean
  /** ISO timestamp of the last persisted write; used to reconstruct elapsed time. */
  updatedAt: string | null
}

interface UseGameTimerOptions {
  matchId: string
  mode: TimerMode
  /** Initial seconds for countdown (e.g. 600 for a 10-min quarter) */
  initialSeconds?: number
  /** When false, no realtime channel (e.g. volleyball / table tennis — no shot clock) */
  enabled?: boolean
}

const SHOT_CLOCK_FULL = 24
const SHOT_CLOCK_SHORT = 14

/** Project a persisted clock snapshot forward to "now" using clock_updated_at.
 *  Shared by the scorer's hydrate() and read-only spectator views (Jumbotron)
 *  so a late joiner sees the real current time instead of a blank placeholder,
 *  even if no `timer_sync` broadcast has arrived yet. Returns null when the
 *  clock was never started (nothing to project). */
export function projectClockForward(persisted: PersistedClockState, mode: TimerMode): TimerState | null {
  if (persisted.seconds == null) return null

  const elapsedSec = persisted.updatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(persisted.updatedAt).getTime()) / 1000))
    : 0

  let seconds = persisted.seconds
  if (persisted.running) {
    seconds = mode === 'countdown' ? Math.max(0, seconds - elapsedSec) : seconds + elapsedSec
  }
  const running = persisted.running && (mode !== 'countdown' || seconds > 0)

  let shotClockSeconds = persisted.shotClockSeconds ?? SHOT_CLOCK_FULL
  if (persisted.shotClockRunning) shotClockSeconds = Math.max(0, shotClockSeconds - elapsedSec)
  const shotClockRunning = persisted.shotClockRunning && shotClockSeconds > 0

  return { seconds, running, shotClockSeconds, shotClockRunning }
}

export function useGameTimer({
  matchId,
  mode,
  initialSeconds = 600,
  enabled = true,
}: UseGameTimerOptions) {
  const [seconds, setSeconds] = useState(mode === 'countdown' ? initialSeconds : 0)
  const [running, setRunning] = useState(false)
  const [shotClockSeconds, setShotClockSeconds] = useState(SHOT_CLOCK_FULL)
  const [shotClockRunning, setShotClockRunning] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const shotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const secondsRef = useRef(seconds)
  const shotSecondsRef = useRef(shotClockSeconds)
  secondsRef.current = seconds
  shotSecondsRef.current = shotClockSeconds

  const channelName = `timer-${matchId}`

  const broadcast = useCallback((state: TimerState) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'timer_sync',
      payload: state,
    })
  }, [])

  // Written only on explicit transitions (never per-tick) — see migration 055
  // and the /:matchId/clock route. Best-effort: a dropped write just means a
  // reload restores from a slightly older snapshot, still reconstructed via
  // clock_updated_at, never a silent reset to a fresh quarter.
  const persist = useCallback(
    (state: TimerState) => {
      if (!enabled || !matchId) return
      void api.patch(`/scoring/${matchId}/clock`, {
        seconds: state.seconds,
        running: state.running,
        shotClockSeconds: state.shotClockSeconds,
        shotClockRunning: state.shotClockRunning,
      }).catch(() => {})
    },
    [enabled, matchId],
  )

  // Realtime (every tick) + persisted (only on explicit transitions, below).
  const emit = useCallback(
    (state: TimerState) => {
      broadcast(state)
      persist(state)
    },
    [broadcast, persist],
  )

  const hydratedRef = useRef(false)

  /** Restore from the last persisted snapshot, projecting elapsed real time
   *  forward if the clock was left running. Call once, as soon as the match
   *  row is loaded — safe to call multiple times, only the first call (per
   *  mount) has any effect, so a later loadState() refresh never yanks the
   *  locally-ticking clock backward. */
  const hydrate = useCallback(
    (persisted: PersistedClockState) => {
      if (hydratedRef.current) return
      hydratedRef.current = true
      const projected = projectClockForward(persisted, mode)
      if (!projected) return // never started — keep the fresh-quarter default
      setSeconds(projected.seconds)
      setRunning(projected.running)
      setShotClockSeconds(projected.shotClockSeconds)
      setShotClockRunning(projected.shotClockRunning)
    },
    [mode],
  )

  const broadcastCurrent = useCallback(() => {
    broadcast({
      seconds: secondsRef.current,
      running,
      shotClockSeconds: shotSecondsRef.current,
      shotClockRunning,
    })
  }, [broadcast, running, shotClockRunning])

  // Main clock tick
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const next = mode === 'countdown' ? Math.max(0, prev - 1) : prev + 1
          if (mode === 'countdown' && next === 0) {
            setRunning(false)
          }
          return next
        })
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running, mode])

  // Shot clock tick
  useEffect(() => {
    if (shotClockRunning) {
      shotIntervalRef.current = setInterval(() => {
        setShotClockSeconds((prev) => {
          const next = Math.max(0, prev - 1)
          if (next === 0) setShotClockRunning(false)
          return next
        })
      }, 1000)
    } else if (shotIntervalRef.current) {
      clearInterval(shotIntervalRef.current)
      shotIntervalRef.current = null
    }
    return () => {
      if (shotIntervalRef.current) clearInterval(shotIntervalRef.current)
    }
  }, [shotClockRunning])

  // Broadcast every tick to jumbotron
  useEffect(() => {
    if (!running && !shotClockRunning) return
    broadcast({
      seconds,
      running,
      shotClockSeconds,
      shotClockRunning,
    })
  }, [seconds, running, shotClockSeconds, shotClockRunning, broadcast])

  useEffect(() => {
    if (!enabled || !matchId) return
    const channel = supabase.channel(channelName)
    channel.subscribe()
    channelRef.current = channel
    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [channelName, enabled, matchId])

  const start = useCallback(() => {
    setRunning(true)
    emit({ seconds: secondsRef.current, running: true, shotClockSeconds: shotSecondsRef.current, shotClockRunning: false })
  }, [emit])

  const pause = useCallback(() => {
    setRunning(false)
    setShotClockRunning(false)
    emit({ seconds: secondsRef.current, running: false, shotClockSeconds: shotSecondsRef.current, shotClockRunning: false })
  }, [emit])

  const resetMainClock = useCallback(
    (newSeconds?: number) => {
      const val = newSeconds ?? (mode === 'countdown' ? initialSeconds : 0)
      setSeconds(val)
      setRunning(false)
      setShotClockRunning(false)
      emit({ seconds: val, running: false, shotClockSeconds: shotSecondsRef.current, shotClockRunning: false })
    },
    [mode, initialSeconds, emit],
  )

  /** Adjust main clock by delta seconds (clamped to [0, initialSeconds]) */
  const adjustMainClock = useCallback(
    (delta: number) => {
      setSeconds((prev) => {
        const next = Math.max(0, Math.min(mode === 'countdown' ? initialSeconds : 99 * 60, prev + delta))
        emit({ seconds: next, running, shotClockSeconds: shotSecondsRef.current, shotClockRunning })
        return next
      })
    },
    [mode, initialSeconds, emit, running, shotClockRunning],
  )

  /** Set main clock to an exact value in seconds */
  const setMainClock = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(mode === 'countdown' ? initialSeconds : 99 * 60, val))
      setSeconds(clamped)
      emit({ seconds: clamped, running, shotClockSeconds: shotSecondsRef.current, shotClockRunning })
    },
    [mode, initialSeconds, emit, running, shotClockRunning],
  )

  const startShotClock = useCallback(() => {
    setShotClockRunning(true)
    emit({ seconds: secondsRef.current, running, shotClockSeconds: shotSecondsRef.current, shotClockRunning: true })
  }, [emit, running])

  const pauseShotClock = useCallback(() => {
    setShotClockRunning(false)
    emit({ seconds: secondsRef.current, running, shotClockSeconds: shotSecondsRef.current, shotClockRunning: false })
  }, [emit, running])

  const resetShotClock = useCallback(
    (full = true) => {
      const val = full ? SHOT_CLOCK_FULL : SHOT_CLOCK_SHORT
      setShotClockSeconds(val)
      setShotClockRunning(false)
      emit({ seconds: secondsRef.current, running, shotClockSeconds: val, shotClockRunning: false })
    },
    [emit, running],
  )

  const adjustShotClock = useCallback(
    (delta: number) => {
      setShotClockSeconds((prev) => {
        const next = Math.max(0, Math.min(SHOT_CLOCK_FULL, prev + delta))
        emit({ seconds: secondsRef.current, running, shotClockSeconds: next, shotClockRunning })
        return next
      })
    },
    [emit, running, shotClockRunning],
  )

  /** Set shot clock to an exact value in seconds (click-to-edit) */
  const setShotClock = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(SHOT_CLOCK_FULL, val))
      setShotClockSeconds(clamped)
      emit({ seconds: secondsRef.current, running, shotClockSeconds: clamped, shotClockRunning })
    },
    [emit, running, shotClockRunning],
  )

  const totalElapsed = mode === 'stopwatch' ? seconds : undefined

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }, [])

  return {
    seconds,
    running,
    shotClockSeconds,
    shotClockRunning,
    start,
    pause,
    resetMainClock,
    adjustMainClock,
    setMainClock,
    startShotClock,
    pauseShotClock,
    resetShotClock,
    adjustShotClock,
    setShotClock,
    totalElapsed,
    formatTime,
    broadcast: broadcastCurrent,
    hydrate,
  }
}

/** Listener hook for jumbotron / read-only consumers. `persisted`, when given,
 *  seeds the display from the last saved clock snapshot (projected forward to
 *  now) so a spectator who connects before any `timer_sync` broadcast arrives
 *  — e.g. during a paused/idle stretch — sees the real time instead of
 *  nothing. Only ever seeds once; a live broadcast always wins after that. */
export function useTimerListener(
  matchId: string,
  enabled = true,
  persisted?: PersistedClockState | null,
  mode: TimerMode = 'countdown',
) {
  const [timerState, setTimerState] = useState<TimerState | null>(null)
  const channelName = `timer-${matchId}`
  const seededRef = useRef(false)

  useEffect(() => {
    if (seededRef.current || !enabled || !persisted) return
    const projected = projectClockForward(persisted, mode)
    if (!projected) return
    seededRef.current = true
    setTimerState((prev) => prev ?? projected)
  }, [enabled, persisted, mode])

  useEffect(() => {
    if (!enabled || !matchId) {
      setTimerState(null)
      return
    }
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'timer_sync' }, (msg) => {
        setTimerState(msg.payload as TimerState)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [channelName, enabled, matchId])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return { timerState, formatTime }
}
