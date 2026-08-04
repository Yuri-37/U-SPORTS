import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { Button, Card, Badge, Alert, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import { formatEnumLabel, formatDateTime } from '../../lib/utils'
import { STAT_KEYS } from '../../lib/matchStatKeys'
import { periodScoreBreakdown } from '../../lib/liveMatchPresentation'

interface PlayerStat {
  athlete_id: string
  stats: Record<string, number>
  athlete?: { id: string; profile?: { full_name: string } | null } | null
  team_name?: string | null
  participant_side?: 'a' | 'b' | null
}

export default function ScoreSheet() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [match, setMatch] = useState<any>(null)
  const [scores, setScores] = useState<any[]>([])
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([])
  const [nameA, setNameA] = useState('Home')
  const [nameB, setNameB] = useState('Away')
  const [scorerName, setScorerName] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const load = useCallback(async () => {
    if (!matchId) return
    try {
      const { data } = await api.get(`/scoring/${matchId}/review`)
      setMatch(data.match)
      setScores(data.scores ?? [])
      setPlayerStats(data.playerStats ?? [])
      setNameA(data.participantNames?.a ?? 'Home')
      setNameB(data.participantNames?.b ?? 'Away')
      setScorerName(data.scorerName ?? null)
    } catch {
      setError('Failed to load the score sheet')
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    load()
  }, [load])

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true)
    try {
      const r = await api.get(`/reports/match/${matchId}/pdf`, { responseType: 'blob' as const })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      // A blob: URL has no HTTP headers of its own, so the server's nicely-named
      // Content-Disposition is never seen here — `a.download` is the only thing
      // that decides the saved filename, and it must build the same name itself
      // (mirrors the `safe()` sanitizer in apps/server/src/routes/reports.ts).
      const safeName = (s: string) =>
        s
          .replace(/[^a-zA-Z0-9 _-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
      a.download = `${safeName(nameA)}-vs-${safeName(nameB)}-score-sheet.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not generate the PDF. Is the match finalized?')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading)
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (!match)
    return <div className="text-center py-12 text-[var(--text-muted)]">Match not found</div>

  if (!match.finalized_at) {
    return (
      <div className="max-w-xl mx-auto text-center py-20 space-y-6">
        <Alert type="warning">
          This match hasn't been finalized yet — finalize it from Post-Game Review first.
        </Alert>
        <Button onClick={() => navigate(`/organizer/match-review/${matchId}`)}>
          Go to Post-Game Review
        </Button>
      </div>
    )
  }

  const sport: string = match?.event?.sport ?? 'basketball'
  const statDefs = STAT_KEYS[sport] ?? STAT_KEYS.basketball
  const scoreA = scores.find((s) => s.participant_id === match.participant_a_id)
  const scoreB = scores.find((s) => s.participant_id === match.participant_b_id)

  const bbTotal = (s: any) =>
    (s?.q1 ?? 0) +
    (s?.q2 ?? 0) +
    (s?.q3 ?? 0) +
    (s?.q4 ?? 0) +
    (s?.ot ?? 0) +
    (s?.ot2 ?? 0) +
    (s?.ot3 ?? 0)
  const finalScoreLabel =
    sport === 'volleyball'
      ? `Sets: ${scoreA?.sets_won ?? 0} – ${scoreB?.sets_won ?? 0}`
      : sport === 'table-tennis'
        ? `Games: ${scoreA?.games_won ?? 0} – ${scoreB?.games_won ?? 0}`
        : `${bbTotal(scoreA)} – ${bbTotal(scoreB)}`

  const winnerId = match.bracket?.winner_id ?? null
  const winnerName =
    winnerId === match.participant_a_id ? nameA : winnerId === match.participant_b_id ? nameB : null

  const periodBreakdown = periodScoreBreakdown(sport, scoreA, scoreB)
  // "FINAL" mirrors the classic printed score sheet's last column — for volleyball/table-tennis
  // that's sets/games won (what actually decides the match), not a meaningless point total.
  const finalColumnLabel =
    sport === 'volleyball' ? 'SETS WON' : sport === 'table-tennis' ? 'GAMES WON' : 'FINAL'
  const finalColumnA =
    sport === 'volleyball'
      ? (scoreA?.sets_won ?? 0)
      : sport === 'table-tennis'
        ? (scoreA?.games_won ?? 0)
        : bbTotal(scoreA)
  const finalColumnB =
    sport === 'volleyball'
      ? (scoreB?.sets_won ?? 0)
      : sport === 'table-tennis'
        ? (scoreB?.games_won ?? 0)
        : bbTotal(scoreB)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Match Score Sheet</h1>
          <p className="text-[var(--text-muted)] text-xs">
            {nameA} vs {nameB}
          </p>
        </div>
        <div className="flex-1" />
        <Badge variant="success">Finalized</Badge>
        <Button
          size="sm"
          icon={<Download className="w-3 h-3" />}
          loading={downloadingPdf}
          onClick={handleDownloadPdf}
        >
          Download PDF
        </Button>
      </div>

      {error && (
        <Alert type="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <div className="-mx-4 -mt-4 mb-4 px-4 py-2 rounded-t-xl bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" /> Match Details
          </h3>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--text-muted)] text-xs">Event</dt>
            <dd>
              {match.event?.name ?? '—'}
              {match.bracket?.round ? ` · Round ${match.bracket.round}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)] text-xs">Sport</dt>
            <dd>{formatEnumLabel(sport)}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)] text-xs">Date</dt>
            <dd>{match.scheduled_at ? formatDateTime(match.scheduled_at) : '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)] text-xs">Venue</dt>
            <dd>{match.venue ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)] text-xs">Scorer</dt>
            <dd>{scorerName ?? '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <div className="-mx-4 -mt-4 mb-4 px-4 py-2 rounded-t-xl bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]">
          <h3 className="font-semibold">Score</h3>
        </div>
        <p className="text-3xl font-black text-center py-2">
          {nameA} {finalScoreLabel} {nameB}
        </p>

        {periodBreakdown && periodBreakdown.rows.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2 text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Team
                  </th>
                  {periodBreakdown.rows.map((row) => (
                    <th
                      key={row.label}
                      className="border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2 text-center text-xs uppercase tracking-wide text-[var(--text-muted)]"
                    >
                      {row.label}
                    </th>
                  ))}
                  <th className="border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-2 text-center text-xs uppercase tracking-wide font-bold">
                    {finalColumnLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className={winnerId === match.participant_a_id ? 'bg-[var(--success)]/10' : ''}>
                  <td className="border border-[var(--border-subtle)] p-2 font-semibold">
                    {nameA}
                  </td>
                  {periodBreakdown.rows.map((row) => (
                    <td
                      key={row.label}
                      className="border border-[var(--border-subtle)] p-2 text-center"
                    >
                      {row.left}
                    </td>
                  ))}
                  <td className="border border-[var(--border-subtle)] p-2 text-center font-bold">
                    {finalColumnA}
                  </td>
                </tr>
                <tr className={winnerId === match.participant_b_id ? 'bg-[var(--success)]/10' : ''}>
                  <td className="border border-[var(--border-subtle)] p-2 font-semibold">
                    {nameB}
                  </td>
                  {periodBreakdown.rows.map((row) => (
                    <td
                      key={row.label}
                      className="border border-[var(--border-subtle)] p-2 text-center"
                    >
                      {row.right}
                    </td>
                  ))}
                  <td className="border border-[var(--border-subtle)] p-2 text-center font-bold">
                    {finalColumnB}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 border-2 border-[var(--success)] rounded-lg bg-[var(--success)]/10 py-3 text-center">
          <p className="text-xs uppercase tracking-widest text-[var(--success)] font-semibold">
            Victorious Team
          </p>
          <p className="text-xl font-black">{winnerName ?? 'Not decided'}</p>
        </div>
      </Card>

      <Card>
        <div className="-mx-4 -mt-4 mb-4 px-4 py-2 rounded-t-xl bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]">
          <h3 className="font-semibold">Player Stats</h3>
        </div>
        {playerStats.length === 0 ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            No roster athletes are linked to these match participants.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
                  <th className="text-left py-2 pr-3 w-36 min-w-36 max-w-36">Team</th>
                  <th className="text-left py-2 pr-3 min-w-[8rem]">Player</th>
                  {statDefs.map((s) => (
                    <th key={s.key} className="text-center py-2 px-2 min-w-[3.5rem]">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerStats.map((ps) => {
                  const teamLabel =
                    ps.team_name?.trim() ??
                    (ps.participant_side === 'a'
                      ? nameA
                      : ps.participant_side === 'b'
                        ? nameB
                        : 'Team')
                  return (
                    <tr key={ps.athlete_id} className="border-t border-[var(--border-subtle)]">
                      <td className="py-2 pr-3 w-36 min-w-36 max-w-36 align-top text-[var(--text-secondary)]">
                        <span
                          className="line-clamp-2 break-words text-xs sm:text-sm"
                          title={teamLabel}
                        >
                          {teamLabel}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-medium min-w-[8rem]">
                        {ps.athlete?.profile?.full_name ?? `Athlete ${ps.athlete_id.slice(0, 6)}`}
                      </td>
                      {statDefs.map((s) => (
                        <td key={s.key} className="py-2 px-2 text-center">
                          {ps.stats?.[s.key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
