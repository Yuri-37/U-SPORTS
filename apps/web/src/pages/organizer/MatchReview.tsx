import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { CheckCircle, ArrowLeft, Save, FileText } from 'lucide-react'
import { Button, Card, Badge, Alert, Skeleton, Modal, Input } from '../../components/ui'
import api from '../../lib/api'
import { formatEnumLabel } from '../../lib/utils'
import { STAT_KEYS } from '../../lib/matchStatKeys'

interface PlayerStat {
  athlete_id: string
  sport: string
  stats: Record<string, number>
  athlete?: { id: string; profile?: { full_name: string } | null } | null
  /** Match participant UUID for team/side roster (solo matches use athlete id as participant). */
  team_id?: string | null
  team_name?: string | null
  participant_side?: 'a' | 'b' | null
}

export default function MatchReview() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [match, setMatch] = useState<any>(null)
  const [scores, setScores] = useState<any[]>([])
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([])
  const [nameA, setNameA] = useState('Home')
  const [nameB, setNameB] = useState('Away')
  const [editedStats, setEditedStats] = useState<Record<string, Record<string, number>>>({})
  const [baselineStats, setBaselineStats] = useState<Record<string, Record<string, number>>>({})
  const [liveStats, setLiveStats] = useState<Record<string, Record<string, number>>>({})
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState('')
  const [finalized, setFinalized] = useState(false)
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [pendingDiff, setPendingDiff] = useState<{ athleteId: string; playerName: string; statLabel: string; oldValue: number; newValue: number }[]>([])
  // Justification stored alongside the before/after diff in audit_logs.
  const [editReason, setEditReason] = useState('')

  const loadReview = useCallback(async () => {
    if (!matchId) return
    try {
      const { data } = await api.get(`/scoring/${matchId}/review`)
      setMatch(data.match)
      // Finalize is a persisted server fact (matches.finalized_at) — checking it
      // here means reloading this page later still shows the finalized screen,
      // instead of only right after clicking "Finalize" in the same session.
      setFinalized(!!data.match?.finalized_at)
      setScores(data.scores ?? [])
      setPlayerStats(data.playerStats ?? [])
      setLiveStats(data.liveStats ?? {})
      setNameA(data.participantNames?.a ?? 'Home')
      setNameB(data.participantNames?.b ?? 'Away')
      const mergedSport = (data.match as { event?: { sport?: string } } | null)?.event?.sport ?? 'basketball'
      const defs = STAT_KEYS[mergedSport] ?? STAT_KEYS.basketball
      const zeros = Object.fromEntries(defs.map((d) => [d.key, 0])) as Record<string, number>
      const initial: Record<string, Record<string, number>> = {}
      for (const ps of data.playerStats ?? []) {
        initial[ps.athlete_id] = { ...zeros, ...((ps.stats as Record<string, number> | undefined) ?? {}) }
      }
      setEditedStats(initial)
      setBaselineStats(initial)
    } catch {
      setError('Failed to load match review data')
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => { loadReview() }, [loadReview])

  const sport: string = match?.event?.sport ?? 'basketball'
  const statDefs = STAT_KEYS[sport] ?? STAT_KEYS.basketball

  const handleStatChange = (athleteId: string, key: string, value: number) => {
    setEditedStats(prev => ({
      ...prev,
      [athleteId]: { ...(prev[athleteId] ?? {}), [key]: Math.max(0, value) },
    }))
  }

  const openSaveConfirm = () => {
    const defs = STAT_KEYS[sport] ?? STAT_KEYS.basketball
    const changes: typeof pendingDiff = []
    for (const ps of playerStats) {
      const baseline = baselineStats[ps.athlete_id] ?? {}
      const edited = editedStats[ps.athlete_id] ?? {}
      const playerName = ps.athlete?.profile?.full_name ?? `Athlete ${ps.athlete_id.slice(0, 6)}`
      for (const def of defs) {
        const oldVal = baseline[def.key] ?? 0
        const newVal = edited[def.key] ?? 0
        if (oldVal !== newVal) {
          changes.push({ athleteId: ps.athlete_id, playerName, statLabel: def.label, oldValue: oldVal, newValue: newVal })
        }
      }
    }
    if (changes.length === 0) return
    setPendingDiff(changes)
    setSaveConfirmOpen(true)
  }

  const handleConfirmedSave = async () => {
    if (editReason.trim().length < 3) {
      setError('Enter a reason for the correction before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Only send athletes whose numbers actually changed. Previously every
      // roster member was PATCHed on every save, which created all-zero rows for
      // players who never appeared and inflated their games_played.
      const touched = new Set(pendingDiff.map((d) => d.athleteId))
      for (const athleteId of touched) {
        await api.patch(`/scoring/${matchId}/player-stats/${athleteId}`, {
          stats: editedStats[athleteId] ?? {},
          reason: editReason.trim(),
        })
      }
      setSaveConfirmOpen(false)
      setEditReason('')
      await loadReview()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Failed to save stats')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!match) return
    setFinalizing(true)
    setError('')
    try {
      // Only push edits when there are any; the save path now requires a reason.
      if (pendingDiff.length > 0) await handleConfirmedSave()

      const winnerId = derivedWinnerId()
      if (!winnerId) {
        setError('The score is level, so a winner cannot be determined. Correct the score first.')
        setFinalizing(false)
        return
      }

      await api.post(`/scoring/${matchId}/finalize`, { winnerId })
      setFinalized(true)
      setFinalizeConfirmOpen(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Finalize failed')
    } finally {
      setFinalizing(false)
    }
  }

  /** Winner implied by the score. Volleyball and table tennis are decided by
   *  sets/games won, not by points — reading the basketball columns made both
   *  tie at 0-0 and always return participant A. */
  function derivedWinnerId(): string | null {
    const scoreA = scores.find(s => s.participant_id === match?.participant_a_id)
    const scoreB = scores.find(s => s.participant_id === match?.participant_b_id)
    if (!scoreA || !scoreB) return null

    let a: number
    let b: number
    if (sport === 'volleyball') {
      a = scoreA.sets_won ?? 0
      b = scoreB.sets_won ?? 0
    } else if (sport === 'table-tennis') {
      a = scoreA.games_won ?? 0
      b = scoreB.games_won ?? 0
    } else {
      a = scoreA.total ?? 0
      b = scoreB.total ?? 0
    }

    if (a > b) return match?.participant_a_id ?? null
    if (b > a) return match?.participant_b_id ?? null
    return null // a genuine tie — refuse to guess
  }

  if (loading) return <div className="space-y-4 max-w-4xl mx-auto">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!match) return <div className="text-center py-12 text-[var(--text-muted)]">Match not found</div>

  if (finalized) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-6">
        <CheckCircle className="w-16 h-16 mx-auto text-[var(--success)]" />
        <h1 className="text-2xl font-bold">Match Finalized</h1>
        <p className="text-[var(--text-muted)]">
          Season totals, standings and insights now reflect these numbers. Any later correction recalculates them automatically and is recorded in the audit log.
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Button icon={<FileText className="w-4 h-4" />} onClick={() => navigate(`/organizer/match-review/${matchId}/score-sheet`)}>
            View Score Sheet
          </Button>
          <Button variant="secondary" onClick={() => navigate('/organizer/events')}>Back to Events</Button>
          <Button variant="secondary" onClick={() => navigate('/organizer/analytics')}>View Analytics</Button>
        </div>
        <button
          type="button"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
          onClick={() => setFinalized(false)}
        >
          Edit stats
        </button>
      </div>
    )
  }

  const scoreA = scores.find(s => s.participant_id === match.participant_a_id)
  const scoreB = scores.find(s => s.participant_id === match.participant_b_id)

  const bbTotal = (s: any) => (s?.q1 ?? 0) + (s?.q2 ?? 0) + (s?.q3 ?? 0) + (s?.q4 ?? 0) + (s?.ot ?? 0) + (s?.ot2 ?? 0) + (s?.ot3 ?? 0)
  const vbSetsWon = (s: any) => s?.sets_won ?? 0
  const ttGamesWon = (s: any) => s?.games_won ?? 0

  const finalScoreLabel = sport === 'basketball'
    ? `${bbTotal(scoreA)} – ${bbTotal(scoreB)}`
    : sport === 'volleyball'
      ? `Sets: ${vbSetsWon(scoreA)} – ${vbSetsWon(scoreB)}`
      : `Games: ${ttGamesWon(scoreA)} – ${ttGamesWon(scoreB)}`

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Post-Game Review</h1>
          <p className="text-[var(--text-muted)] text-xs">{nameA} vs {nameB}</p>
        </div>
        <div className="flex-1" />
        <Badge variant="success">Completed</Badge>
      </div>

      {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <Card>
        <h3 className="font-semibold mb-1">Final Score</h3>
        <p className="text-3xl font-black text-center py-4">{nameA} {finalScoreLabel} {nameB}</p>
        <p className="text-center text-xs text-[var(--text-muted)]">{formatEnumLabel(sport)}</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Player Stats</h3>
          <Button size="sm" variant="secondary" icon={<Save className="w-3 h-3" />} loading={saving} onClick={openSaveConfirm}>
            Save changes
          </Button>
        </div>

        {playerStats.length === 0 ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            No roster athletes are linked to these match participants. Confirm team rosters and that players are on the official roster for this
            event.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 pr-3 w-36 min-w-36 max-w-36 shrink-0 sticky left-0 z-[2] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                    Team
                  </th>
                  <th className="text-left py-2 pr-3 min-w-[8rem] sticky left-36 z-[2] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                    Player
                  </th>
                  {statDefs.map(s => (
                    <th key={s.key} className="text-center py-2 px-2 min-w-[3.5rem]">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerStats.map(ps => {
                  const teamLabel =
                    ps.team_name?.trim()
                    ?? (ps.participant_side === 'a' ? nameA : ps.participant_side === 'b' ? nameB : 'Team')
                  return (
                  <tr key={ps.athlete_id} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2 pr-3 w-36 min-w-36 max-w-36 shrink-0 align-top text-[var(--text-secondary)] sticky left-0 z-[1] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                      <span className="line-clamp-2 break-words text-xs sm:text-sm" title={teamLabel}>
                        {teamLabel}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-medium min-w-[8rem] sticky left-36 z-[1] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                      {ps.athlete?.profile?.full_name ?? `Athlete ${ps.athlete_id.slice(0, 6)}`}
                    </td>
                    {statDefs.map(s => {
                      const editedVal = editedStats[ps.athlete_id]?.[s.key] ?? 0
                      const liveVal = liveStats[ps.athlete_id]?.[s.key] ?? 0
                      const diverged = liveVal !== editedVal
                      return (
                        <td key={s.key} className="py-2 px-1 text-center">
                          <input
                            type="number"
                            min={0}
                            title={`${ps.athlete?.profile?.full_name ?? 'Athlete'} — ${s.label}`}
                            value={editedVal}
                            onChange={e => handleStatChange(ps.athlete_id, s.key, parseInt(e.target.value) || 0)}
                            className={`w-14 text-center bg-[var(--surface-elevated)] border rounded px-1 py-1 text-sm text-[var(--text-primary)] ${diverged ? 'border-amber-500/60' : 'border-[var(--border-subtle)]'}`}
                          />
                          {diverged && (
                            <div className="text-[10px] text-amber-400/70 mt-0.5 leading-none">
                              live: {liveVal}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold">Ready to finalize?</p>
          <p className="text-xs text-[var(--text-muted)]">This will update season leaderboards, team standings, and generate insights.</p>
        </div>
        <Button loading={finalizing} onClick={() => setFinalizeConfirmOpen(true)} icon={<CheckCircle className="w-4 h-4" />}>
          Finalize Match
        </Button>
      </Card>

      <Modal open={saveConfirmOpen} onClose={() => !saving && setSaveConfirmOpen(false)} title="Confirm stat changes" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">The following stats will be updated:</p>
          <div className="max-h-64 overflow-y-auto border border-[var(--border-subtle)] rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-card)]">
                <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 px-3">Player</th>
                  <th className="text-left py-2 px-2">Stat</th>
                  <th className="text-center py-2 px-2">Old</th>
                  <th className="text-center py-2 px-2">New</th>
                </tr>
              </thead>
              <tbody>
                {pendingDiff.map((c, i) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 px-3 font-medium">{c.playerName}</td>
                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">{c.statLabel}</td>
                    <td className="py-1.5 px-2 text-center text-[var(--text-muted)]">{c.oldValue}</td>
                    <td className="py-1.5 px-2 text-center font-bold text-[var(--text-primary)]">{c.newValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Input
            label="Reason for this correction"
            placeholder="e.g. Scorer credited the rebound to the wrong player"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            required
          />
          <p className="text-xs text-[var(--text-muted)]">
            This reason and the exact before/after values are recorded in the audit log. Season totals
            are recalculated as soon as you save.
          </p>
          <div className="flex gap-3 justify-end flex-wrap">
            <Button variant="secondary" disabled={saving} onClick={() => setSaveConfirmOpen(false)}>Cancel</Button>
            <Button loading={saving} disabled={editReason.trim().length < 3} onClick={() => void handleConfirmedSave()} icon={<Save className="w-4 h-4" />}>Confirm Save</Button>
          </div>
        </div>
      </Modal>

      <Modal open={finalizeConfirmOpen} onClose={() => !finalizing && setFinalizeConfirmOpen(false)} title="Finalize match" size="md">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Finalizing publishes these stats to season leaderboards, standings, and insights. Double-check scores above — fixing mistakes
            afterward requires another review pass.
          </p>
          <div className="flex gap-3 justify-end flex-wrap">
            <Button variant="secondary" disabled={finalizing} onClick={() => setFinalizeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={finalizing} onClick={() => void handleFinalize()} icon={<CheckCircle className="w-4 h-4" />}>
              Yes, finalize
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
