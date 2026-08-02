import React, { useEffect, useState } from 'react'
import { Tv2 } from 'lucide-react'
import { Modal, Badge, Skeleton, Button } from '../ui'
import api from '../../lib/api'
import { formatDateTime, formatEnumLabel } from '../../lib/utils'
import {
  pickScoresForMatch,
  periodScoreBreakdown,
  liveScorePresentation,
} from '../../lib/liveMatchPresentation'
import type { Match, MatchScore } from '../../types'

type MatchStatePayload = {
  match: (Match & { winner_id?: string | null }) | null
  scores: Partial<MatchScore>[]
  participantNames?: { a: string; b: string }
}

type Props = {
  open: boolean
  onClose: () => void
  matchId: string | null
  sport: string
}

export default function PublicMatchDetailModal({ open, onClose, matchId, sport }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MatchStatePayload | null>(null)

  useEffect(() => {
    if (!open || !matchId) {
      setPayload(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void api
      .get<MatchStatePayload>(`/scoring/${matchId}/state`)
      .then((res) => {
        if (!cancelled) setPayload(res.data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load match details.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, matchId])

  const match = payload?.match
  const nameA = payload?.participantNames?.a ?? 'Side A'
  const nameB = payload?.participantNames?.b ?? 'Side B'
  const scores = payload?.scores ?? []
  const { sa, sb } = pickScoresForMatch(match?.participant_a_id, match?.participant_b_id, scores)

  const scorePhaseReady =
    Boolean(match) && scores.length > 0 && (match!.status === 'live' || match!.status === 'completed')

  const breakdown = scorePhaseReady ? periodScoreBreakdown(sport, sa, sb) : null

  const presentationFallback =
    scorePhaseReady && !breakdown
      ? liveScorePresentation(sport, sa, sb, 1)
      : scorePhaseReady && breakdown?.rows.length === 0 && !breakdown.summaryLine
        ? liveScorePresentation(sport, sa, sb, 1)
        : null

  const periodColumnLabel =
    sport === 'basketball' ? 'Quarter' : sport === 'volleyball' ? 'Set' : sport === 'table-tennis' ? 'Game' : 'Period'

  const totalsRowLabel =
    sport === 'basketball'
      ? 'Total'
      : sport === 'volleyball' || sport === 'table-tennis'
        ? 'Points (all periods)'
        : 'Total'

  const showPeriodTable = Boolean(breakdown && breakdown.rows.length > 0)
  const showSummaryOnly =
    Boolean(breakdown && breakdown.rows.length === 0 && breakdown.summaryLine)

  return (
    <Modal open={open} onClose={onClose} title="Match details" size="lg">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--text-muted)]">{error}</p>
      ) : !match ? (
        <p className="text-sm text-[var(--text-muted)]">Match not found.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={match.status === 'live' ? 'danger' : match.status === 'completed' ? 'success' : 'default'}
              size="sm"
            >
              {match.status === 'live' ? '● LIVE' : formatEnumLabel(match.status)}
            </Badge>
            {match.scheduled_at ? (
              <span className="text-[var(--text-muted)]">
                {formatDateTime(match.scheduled_at)}
                {match.venue ? ` · ${match.venue}` : ''}
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">Schedule not set</span>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Matchup</p>
            <p className="text-lg font-semibold">
              {nameA} <span className="text-[var(--text-muted)] font-normal text-base">vs</span> {nameB}
            </p>

            {scorePhaseReady ? (
              <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-4">
                {breakdown?.summaryLine ? (
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{breakdown.summaryLine}</p>
                ) : null}

                {showPeriodTable ? (
                  <>
                    <p className="text-xs text-[var(--text-muted)]">
                      {sport === 'basketball'
                        ? 'Basketball · Score by quarter (includes overtime when played)'
                        : sport === 'volleyball'
                          ? 'Volleyball · Rally points per set'
                          : sport === 'table-tennis'
                            ? 'Table tennis · Points per game'
                            : 'Score by period'}
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                      <table className="w-full text-sm min-w-[280px]">
                        <thead>
                          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-card)]">
                            <th className="text-left py-2.5 px-3 font-semibold text-[var(--text-muted)]">{periodColumnLabel}</th>
                            <th className="text-right py-2.5 px-3 font-semibold tabular-nums max-w-[42%] truncate" title={nameA}>
                              {nameA}
                            </th>
                            <th className="text-right py-2.5 px-3 font-semibold tabular-nums max-w-[42%] truncate" title={nameB}>
                              {nameB}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdown!.rows.map((row) => (
                            <tr key={row.label} className="border-b border-[var(--border-subtle)] last:border-b-0">
                              <td className="py-2 px-3 text-[var(--text-muted)]">{row.label}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-medium">{row.left}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-medium">{row.right}</td>
                            </tr>
                          ))}
                          <tr className="bg-[var(--surface-card)] font-semibold border-t border-[var(--border-subtle)]">
                            <td className="py-2.5 px-3">{totalsRowLabel}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{breakdown!.totals.left}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{breakdown!.totals.right}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : showSummaryOnly ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Per-set or per-game points were not recorded; showing match outcome summary above.
                  </p>
                ) : presentationFallback ? (
                  <>
                    <p className="text-xs text-[var(--text-muted)] mb-1">{presentationFallback.subtitle}</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {presentationFallback.left}{' '}
                      <span className="text-[var(--text-muted)] font-normal text-lg mx-1">—</span>{' '}
                      {presentationFallback.right}
                    </p>
                  </>
                ) : (
                  <p className="text-[var(--text-muted)] text-xs">No score breakdown available for this sport yet.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[var(--text-muted)] text-xs">
                {match.status === 'scheduled' ? 'Scores appear once the match is underway.' : 'No score rows yet.'}
              </p>
            )}
          </div>

          {match.status === 'live' ? (
            <Button size="sm" variant="secondary" icon={<Tv2 className="w-4 h-4" />} onClick={() => window.open(`/jumbotron/${match.id}`, '_blank')}>
              Open live board
            </Button>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
