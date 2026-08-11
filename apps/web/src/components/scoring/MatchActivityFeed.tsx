import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { Card } from '../ui'
import { supabase } from '../../lib/supabase'
import type { MatchPresenceEntry } from '../../hooks/useMatchPresence'

interface ScoringActionRow {
  id: string
  action_type: string
  value: number
  quarter_or_set: number | null
  timestamp: string
  undone: boolean
  recorded_by: string | null
  participant_id: string | null
}

interface FeedLine {
  id: string
  text: string
  at: string
}

const ACTION_LABELS: Record<string, string> = {
  rebound: 'Defensive rebound',
  off_rebound: 'Offensive rebound',
  assist: 'Assist',
  steal: 'Steal',
  block: 'Block',
  turnover: 'Turnover',
  foul: 'Foul',
  miss_1: 'Missed free throw',
  miss_2: 'Missed 2PT',
  miss_3: 'Missed 3PT',
  kill: 'Kill',
  ace: 'Ace',
  dig: 'Dig',
  error: 'Attack error',
  serve_error: 'Service error',
  reception_error: 'Reception error',
  tt_winner: 'Winner',
  tt_ace: 'Ace',
  tt_error: 'Unforced error',
  timeout: 'Timeout',
  substitution: 'Substitution',
}

function actionLabel(row: ScoringActionRow): string {
  if (row.action_type.startsWith('point_')) return `+${row.value} pts`
  return ACTION_LABELS[row.action_type] ?? row.action_type
}

interface Props {
  matchId: string
  online: MatchPresenceEntry[]
  selfId: string | null
  selfName: string | null
  nameA: string
  nameB: string
  participantAId: string
  participantBId: string
  currentPeriod: number
  periodLabel: string
  recentActions: ScoringActionRow[]
  scoringLockedBy: string | null
  clockLockedBy: string | null
}

/** Live "who did what" log so concurrent scoring/clock actions from different
 *  organizers stay legible instead of confusing. Persisted lines come from
 *  scoring_actions (already tracks recorded_by); clock/lock-holder lines are
 *  ephemeral (diffed client-side off state already being synced elsewhere —
 *  not a second audit trail, that's what audit_logs is for). */
export default function MatchActivityFeed({
  matchId,
  online,
  selfId,
  selfName,
  nameA,
  nameB,
  participantAId,
  participantBId,
  currentPeriod,
  periodLabel,
  recentActions,
  scoringLockedBy,
  clockLockedBy,
}: Props) {
  const [lines, setLines] = useState<FeedLine[]>([])
  const nameCacheRef = useRef<Map<string, string>>(new Map())
  const seededRef = useRef(false)
  const prevScoringLockRef = useRef(scoringLockedBy)
  const prevClockLockRef = useRef(clockLockedBy)

  const resolveActorName = useCallback(
    async (profileId: string): Promise<string> => {
      if (profileId === selfId && selfName) return selfName
      const cached = nameCacheRef.current.get(profileId)
      if (cached) return cached
      const fromPresence = online.find((o) => o.user_id === profileId)?.full_name
      if (fromPresence) {
        nameCacheRef.current.set(profileId, fromPresence)
        return fromPresence
      }
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', profileId)
        .maybeSingle()
      const name = data?.full_name ?? 'Someone'
      nameCacheRef.current.set(profileId, name)
      return name
    },
    [online, selfId, selfName],
  )

  const pushLine = useCallback((text: string) => {
    setLines((prev) => [{ id: `${Date.now()}-${Math.random()}`, text, at: new Date().toISOString() }, ...prev].slice(0, 30))
  }, [])

  const addActionLine = useCallback(
    async (row: ScoringActionRow, prefix = '') => {
      const side = row.participant_id === participantAId ? nameA : nameB
      const actor = row.recorded_by ? await resolveActorName(row.recorded_by) : 'Someone'
      const period = row.quarter_or_set ? ` (${periodLabel} ${row.quarter_or_set})` : ''
      pushLine(`${prefix}${actor} — ${actionLabel(row)} for ${side}${period}`)
    },
    [participantAId, nameA, nameB, periodLabel, resolveActorName, pushLine],
  )

  // Seed from the already-fetched recent actions (from loadState()) — no duplicate fetch.
  useEffect(() => {
    if (seededRef.current || recentActions.length === 0) return
    seededRef.current = true
    // Oldest-to-newest so pushLine's prepend ends up newest-first.
    void (async () => {
      for (const row of [...recentActions].reverse()) {
        await addActionLine(row)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // New scoring/stat actions, live.
  useEffect(() => {
    const channel = supabase
      .channel(`scoring-actions-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scoring_actions', filter: `match_id=eq.${matchId}` },
        (payload) => {
          void addActionLine(payload.new as ScoringActionRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scoring_actions', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as ScoringActionRow
          const old = payload.old as Partial<ScoringActionRow>
          if (row.undone && !old.undone) void addActionLine(row, 'Undo — ')
        },
      )
      .subscribe()
    return () => {
      channel.unsubscribe()
    }
  }, [matchId, addActionLine])

  // Clock start/pause — ephemeral, off the existing timer_sync broadcast.
  useEffect(() => {
    const runningRef = { current: null as boolean | null }
    const channel = supabase
      .channel(`timer-${matchId}`)
      .on('broadcast', { event: 'timer_sync' }, (msg) => {
        const running = (msg.payload as { running?: boolean })?.running
        if (typeof running !== 'boolean' || running === runningRef.current) return
        const wasFirst = runningRef.current === null
        runningRef.current = running
        if (wasFirst) return // don't announce the initial sync on page load
        pushLine(running ? 'Game clock started' : 'Game clock paused')
      })
      .subscribe()
    return () => {
      channel.unsubscribe()
    }
  }, [matchId, pushLine])

  // Lock claims/transfers — diffed client-side (matches has no REPLICA IDENTITY
  // FULL, so postgres_changes payload.old won't carry the previous value).
  useEffect(() => {
    void (async () => {
      if (scoringLockedBy !== prevScoringLockRef.current) {
        if (scoringLockedBy) {
          const name = await resolveActorName(scoringLockedBy)
          pushLine(`${name} claimed the scoring lock`)
        }
        prevScoringLockRef.current = scoringLockedBy
      }
    })()
  }, [scoringLockedBy, resolveActorName, pushLine])

  useEffect(() => {
    void (async () => {
      if (clockLockedBy !== prevClockLockRef.current) {
        if (clockLockedBy) {
          const name = await resolveActorName(clockLockedBy)
          pushLine(`${name} claimed the clock lock`)
        }
        prevClockLockRef.current = clockLockedBy
      }
    })()
  }, [clockLockedBy, resolveActorName, pushLine])

  if (lines.length === 0) return null

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Activity className="w-4 h-4 text-[var(--text-muted)]" />
        Activity
      </div>
      {/* Taller in the xl side rail, where there's vertical room to spare — the
          48-unit cap only exists for the stacked single-column layout below xl. */}
      <div className="max-h-48 xl:max-h-[60vh] overflow-y-auto space-y-1.5">
        {lines.map((line) => (
          <p key={line.id} className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {line.text}
          </p>
        ))}
      </div>
    </Card>
  )
}
