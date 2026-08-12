import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  ChevronDown,
  Download,
  FileText,
  Lightbulb,
  Loader2,
  RefreshCw,
  Trophy,
  TrendingUp,
} from 'lucide-react'
import { Card, TabBar, Select, Button, Badge, Skeleton, Alert } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import api from '../../lib/api'
import type { Insight, Season } from '../../types'
import { getSportLabel, formatEnumLabel, formatDate } from '../../lib/utils'
import {
  deriveEliminationPodium,
  placementRankLabel,
  type EventPlacement,
} from '../../lib/eventPlacements'
import { fetchParticipantLabels } from '../../lib/participantLabels'
import { buildSeasonAggregateInsights } from '../../lib/analyticsComputedInsights'
import { STAT_KEYS } from '../../lib/matchStatKeys'
import { playerStatCells, sortByRank, sortTeamStandings } from '../../lib/leaderboardStats'

function insightNavigationTarget(insight: Insight): string {
  return insight.entity_type === 'player'
    ? `/guest/athletes/${insight.entity_id}`
    : `/guest/teams/${insight.entity_id}`
}

const INSIGHT_FILTER_GROUPS: Record<string, string[]> = {
  trending: ['trending_up', 'trending_down'],
  debuts: ['debut_standout'],
  team: ['streak', 'first_win'],
}

const INSIGHT_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  trending: 'Trending',
  debuts: 'Debuts',
  team: 'Team form',
}

/** Supporting detail for one insight — the box-score line for a debut, the
 *  rolling-vs-season comparison for a trend, or nothing extra for team form
 *  (its record is already in the headline sentence). */
function InsightExpandedDetail({ insight }: { insight: Insight }) {
  const d = insight.data as Record<string, unknown>

  if (
    insight.insight_type === 'debut_standout' &&
    d.full_stats &&
    typeof d.full_stats === 'object'
  ) {
    const defs = STAT_KEYS[insight.sport] ?? []
    const stats = d.full_stats as Record<string, number>
    return (
      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--border-subtle)]">
        {defs
          .filter((s) => (stats[s.key] ?? 0) > 0)
          .map((s) => (
            <span key={s.key} className="text-xs bg-[var(--surface-elevated)] px-2 py-0.5 rounded">
              {s.label}: <span className="font-semibold">{stats[s.key]}</span>
            </span>
          ))}
      </div>
    )
  }

  if (insight.insight_type === 'trending_up' || insight.insight_type === 'trending_down') {
    const rolling = Number(d.rolling_avg ?? 0)
    const season = Number(d.season_avg ?? 0)
    return (
      <div className="flex gap-4 mt-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
        <div>
          <p className="text-[var(--text-muted)]">Last 3 games</p>
          <p className="font-semibold">{rolling.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[var(--text-muted)]">Season avg</p>
          <p className="font-semibold">{season.toFixed(1)}</p>
        </div>
      </div>
    )
  }

  return null
}

function InsightActions({ insight }: { insight: Insight }) {
  const navigate = useNavigate()
  const matchId = typeof insight.data?.match_id === 'string' ? insight.data.match_id : null
  return (
    <div className="flex gap-3 mt-2 text-xs">
      <button
        type="button"
        className="text-[var(--accent-default)] hover:underline font-medium"
        onClick={(e) => {
          e.stopPropagation()
          navigate(insightNavigationTarget(insight))
        }}
      >
        View {insight.entity_type === 'player' ? 'profile' : 'team'} →
      </button>
      {matchId && (
        <button
          type="button"
          className="text-[var(--accent-default)] hover:underline font-medium"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/organizer/match-review/${matchId}/score-sheet`)
          }}
        >
          View match →
        </button>
      )}
    </div>
  )
}

function formatSeasonSelectLabel(s: Season): string {
  if (s.status === 'active') return `${s.name} · Active`
  if (s.status === 'completed') return `${s.name} · Completed`
  if (s.status === 'archived') return `${s.name} · Archived`
  if (s.status === 'draft') return `${s.name} · Draft`
  return s.name
}

export default function OrganizerAnalytics() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('leaderboard')
  const [sport, setSport] = useState('basketball')
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [teamStats, setTeamStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [eventPodiums, setEventPodiums] = useState<
    { event: { id: string; name: string }; placements: EventPlacement[] }[]
  >([])
  const [podiumLabels, setPodiumLabels] = useState<Record<string, string>>({})
  const [insightsRefreshing, setInsightsRefreshing] = useState(false)
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [finalizedMatches, setFinalizedMatches] = useState<any[]>([])
  const [scoreSheetsLoading, setScoreSheetsLoading] = useState(false)
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null)
  const [insightFilter, setInsightFilter] = useState<'all' | 'trending' | 'debuts' | 'team'>('all')
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSeasonsLoading(true)
      const { data, error } = await supabase
        .from('seasons')
        .select('id, name, status, start_date, end_date, created_at')
        .order('start_date', { ascending: false, nullsFirst: false })
      if (cancelled) return
      if (error) setSeasons([])
      else setSeasons((data ?? []) as Season[])
      setSeasonsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveSeasonId = useMemo(() => {
    if (!seasons.length) return null
    if (selectedSeasonId && seasons.some((s) => s.id === selectedSeasonId)) return selectedSeasonId
    const active = seasons.find((s) => s.status === 'active')
    return active?.id ?? seasons[0]?.id ?? null
  }, [seasons, selectedSeasonId])

  const seasonSelectOptions = useMemo(
    () => seasons.map((s) => ({ value: s.id, label: formatSeasonSelectLabel(s) })),
    [seasons],
  )

  useEffect(() => {
    if (!effectiveSeasonId) {
      setInsights([])
      setLeaderboard([])
      setTeamStats([])
      setEventPodiums([])
      setPodiumLabels({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const loadData = async () => {
      const seasonId = effectiveSeasonId

      try {
        const [lb, ts] = await Promise.all([
          supabase
            .from('player_season_stats')
            .select(
              '*, athlete:athletes(student_id, department, profile:profiles!athletes_profile_id_fkey(full_name))',
            )
            .eq('sport', sport)
            .eq('season_id', seasonId)
            .order('games_played', { ascending: false })
            .limit(15),
          supabase
            .from('team_season_stats')
            .select('*, team:teams(name, sport, department)')
            .eq('season_id', seasonId)
            .order('wins', { ascending: false }),
        ])

        if (cancelled) return

        try {
          const ins = await api.get(
            `/insights?sport=${encodeURIComponent(sport)}&season_id=${seasonId}`,
          )
          if (!cancelled) setInsights(ins.data ?? [])
        } catch {
          if (!cancelled) setInsights([])
        }

        const lbRows = lb.data ?? []
        const tsRows = (ts as { data: any[] | null }).data ?? []
        setLeaderboard(lbRows)
        setTeamStats(tsRows)

        const podiumRows: { event: { id: string; name: string }; placements: EventPlacement[] }[] =
          []
        const { data: doneEv } = await supabase
          .from('events')
          .select('id,name')
          .eq('season_id', seasonId)
          .eq('sport', sport)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(14)

        for (const ev of doneEv ?? []) {
          const { data: br } = await supabase
            .from('brackets')
            .select(
              'round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type',
            )
            .eq('event_id', ev.id)
          const placements = deriveEliminationPodium(br ?? [])
          if (!placements) continue
          podiumRows.push({ event: ev as { id: string; name: string }, placements })
        }

        if (cancelled) return

        setEventPodiums(podiumRows)
        const pid = new Set<string>()
        podiumRows.forEach((r) => r.placements.forEach((p) => pid.add(p.participantId)))
        if (pid.size === 0) {
          if (!cancelled) setPodiumLabels({})
        } else {
          try {
            const labels = await fetchParticipantLabels([...pid])
            if (!cancelled) setPodiumLabels(labels)
          } catch {
            if (!cancelled) setPodiumLabels({})
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [sport, effectiveSeasonId])

  const runInsightsBackfill = useCallback(async (): Promise<boolean> => {
    if (!effectiveSeasonId) return false
    setInsightsRefreshing(true)
    try {
      await api.post(
        '/insights/backfill-season',
        { seasonId: effectiveSeasonId, sport },
        { timeout: 120000 },
      )
      const ins = await api.get(
        `/insights?sport=${encodeURIComponent(sport)}&season_id=${effectiveSeasonId}`,
      )
      setInsights(ins.data ?? [])
      return true
    } catch {
      return false
    } finally {
      setInsightsRefreshing(false)
    }
  }, [effectiveSeasonId, sport])

  /** Completed matches may pre-date server-side insight jobs — scan once per browser session when this tab is empty. */
  useEffect(() => {
    if (
      tab !== 'insights' ||
      loading ||
      seasonsLoading ||
      !effectiveSeasonId ||
      insights.length > 0
    )
      return
    const key = `analytics-auto-insights:v1:${effectiveSeasonId}:${sport}`
    try {
      if (sessionStorage.getItem(key)) return
    } catch {
      /* ignore */
    }
    void (async () => {
      const ok = await runInsightsBackfill()
      if (ok) {
        try {
          sessionStorage.setItem(key, '1')
        } catch {
          /* ignore */
        }
      }
    })()
  }, [tab, loading, seasonsLoading, insights.length, effectiveSeasonId, sport, runInsightsBackfill])

  useEffect(() => {
    if (tab !== 'scoresheets' || !effectiveSeasonId) return
    let cancelled = false
    setScoreSheetsLoading(true)
    api
      .get('/scoring/finalized-matches', { params: { seasonId: effectiveSeasonId, sport } })
      .then((res) => {
        if (!cancelled) setFinalizedMatches(res.data?.matches ?? [])
      })
      .catch(() => {
        if (!cancelled) setFinalizedMatches([])
      })
      .finally(() => {
        if (!cancelled) setScoreSheetsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, effectiveSeasonId, sport])

  const aggregateInsights = useMemo(
    () => buildSeasonAggregateInsights(sport, leaderboard, teamStats),
    [sport, leaderboard, teamStats],
  )

  const filteredInsights = useMemo(() => {
    if (insightFilter === 'all') return insights
    const types = INSIGHT_FILTER_GROUPS[insightFilter] ?? []
    return insights.filter((i) => types.includes(i.insight_type))
  }, [insights, insightFilter])

  const teamStatsForSport = useMemo(
    () =>
      // Ranked by win percentage rather than the query's raw `wins`, which tied
      // e.g. 2W-0L with 2W-3L and ordered them arbitrarily.
      sortTeamStandings(
        teamStats.filter((ts) => {
          if (ts.team?.sport !== sport) return false
          if (departmentFilter && (ts.team?.department ?? '') !== departmentFilter) return false
          return true
        }),
      ),
    [teamStats, sport, departmentFilter],
  )

  const filteredLeaderboard = useMemo(() => {
    const rows = departmentFilter
      ? leaderboard.filter((p) => (p.athlete?.department ?? '') === departmentFilter)
      : leaderboard
    // Ordered by the sport's headline stat rather than the query's
    // games_played, which left equal-GP athletes in arbitrary order. This also
    // decides the chart's "top 10", which was previously an arbitrary 10.
    return sortByRank(rows, sport)
  }, [leaderboard, departmentFilter, sport])

  // A blob: URL carries no HTTP headers of its own, so the server's Content-Disposition
  // is never seen here — whatever name we set below is the one the browser saves.
  const safeFilenamePart = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  const downloadBlob = (data: Blob, filename: string) => {
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = async () => {
    if (!effectiveSeasonId) return
    const seasonName = seasons.find((s) => s.id === effectiveSeasonId)?.name ?? 'season'
    const dateStamp = new Date().toISOString().slice(0, 10)
    const namePrefix = `${safeFilenamePart(seasonName)}-${safeFilenamePart(sport)}`

    setExportError('')
    try {
      if (tab === 'insights') {
        // Downloads whatever category is selected on screen right now — the detail
        // sheet is scoped to it, though the Summary sheet's counts always cover the
        // whole sport regardless of filter.
        const qs = new URLSearchParams({
          seasonId: effectiveSeasonId,
          sport,
          filter: insightFilter,
        })
        const r = await api.get(`/reports/analytics/insights-xlsx?${qs.toString()}`, {
          responseType: 'blob' as const,
        })
        const filterSuffix = insightFilter === 'all' ? '' : `-${insightFilter}`
        downloadBlob(r.data, `${namePrefix}-insights${filterSuffix}-${dateStamp}.xlsx`)
        return
      }
      const qs = new URLSearchParams({ seasonId: effectiveSeasonId, sport, tab })
      const r = await api.get(`/reports/analytics/csv?${qs.toString()}`, {
        responseType: 'blob' as const,
      })
      downloadBlob(r.data, `${namePrefix}-${tab}-${dateStamp}.csv`)
    } catch (e: unknown) {
      // responseType is 'blob', so an axios error body arrives as a Blob even
      // though the server sent JSON — read it back out to get the real message.
      let message = 'Could not export. Please try again.'
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 403) {
          message = "You don't have permission to export this."
        }
        const data = e.response?.data
        if (data instanceof Blob) {
          try {
            const parsed = JSON.parse(await data.text())
            if (parsed?.error) message = String(parsed.error)
          } catch {
            /* body wasn't JSON — keep the status-based message */
          }
        }
      }
      setExportError(message)
    }
  }

  const chartData = filteredLeaderboard.slice(0, 10).map((p) => ({
    name: p.athlete?.profile?.full_name?.split(' ').slice(-1)[0] ?? 'Player',
    GP: p.games_played,
    ...(sport === 'basketball'
      ? {
          PPG: p.games_played > 0 ? ((p.stats?.total_points ?? 0) / p.games_played).toFixed(1) : 0,
          RPG:
            p.games_played > 0 ? ((p.stats?.total_rebounds ?? 0) / p.games_played).toFixed(1) : 0,
        }
      : sport === 'volleyball'
        ? {
            Kills: p.stats?.kills ?? 0,
            Aces: p.stats?.aces ?? 0,
          }
        : {
            // `mw` (match wins) is never written by scoring — charting it drew
            // a row of zero-height bars for every table tennis player.
            Winners: p.stats?.winners ?? 0,
            Aces: p.stats?.aces ?? 0,
          }),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-[var(--text-muted)] text-sm">
            Performance insights, placements, and leaderboards
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end w-full lg:w-auto lg:max-w-3xl">
          <Select
            label="Season"
            value={effectiveSeasonId ?? ''}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
            options={
              seasonSelectOptions.length > 0
                ? seasonSelectOptions
                : [{ value: '', label: seasonsLoading ? 'Loading seasons…' : 'No seasons' }]
            }
            disabled={seasonsLoading || !effectiveSeasonId || seasons.length === 0}
            className="min-w-[200px] flex-1 sm:flex-none sm:w-56"
          />
          <Select
            label="Sport"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            options={[
              { value: 'basketball', label: '🏀 Basketball' },
              { value: 'volleyball', label: '🏐 Volleyball' },
              { value: 'table-tennis', label: '🏓 Table Tennis' },
            ]}
            className="min-w-[160px] flex-1 sm:flex-none sm:w-48"
          />
          <Select
            label="Department"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            options={[
              { value: '', label: 'All departments' },
              { value: 'SBMA', label: 'SBMA' },
              { value: 'SECA', label: 'SECA' },
              { value: 'SASE', label: 'SASE' },
              { value: 'SHS', label: 'SHS' },
            ]}
            className="min-w-[130px] flex-1 sm:flex-none sm:w-40"
          />
          {tab !== 'scoresheets' && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="w-4 h-4" />}
              onClick={() => void handleExportCSV()}
              disabled={!effectiveSeasonId}
            >
              {tab === 'insights'
                ? `Export Excel${insightFilter !== 'all' ? ` (${INSIGHT_FILTER_LABELS[insightFilter]})` : ''}`
                : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      {exportError && <Alert type="danger">{exportError}</Alert>}

      <TabBar
        tabs={[
          { id: 'leaderboard', label: 'Leaderboard' },
          { id: 'insights', label: 'Insights' },
          { id: 'results', label: 'Event results' },
          { id: 'teams', label: 'Teams' },
          { id: 'scoresheets', label: 'Score Sheets' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'leaderboard' && (
        <div className="space-y-6">
          {chartData.length > 0 && (
            <Card>
              <h3 className="font-bold mb-4">Top performers — {getSportLabel(sport as any)}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#8888A0', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8888A0', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#16161E',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                  />
                  <Bar
                    dataKey={
                      sport === 'basketball' ? 'PPG' : sport === 'volleyball' ? 'Kills' : 'Winners'
                    }
                    fill="#0066FF"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Athlete
                    </th>
                    {playerStatCells(sport, null, 0).map((c) => (
                      <th
                        key={c.label}
                        className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((p, i) => (
                    <tr
                      key={p.id}
                      className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)]"
                    >
                      <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {p.athlete?.profile?.full_name ?? '—'}
                      </td>
                      {playerStatCells(sport, p.stats, p.games_played).map((c) => (
                        <td
                          key={c.label}
                          className={`px-4 py-3 text-center tabular-nums ${c.emphasis ? 'font-bold' : ''}`}
                        >
                          {c.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filteredLeaderboard.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-[var(--text-muted)]">
                        No stats yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-4">
          <Card className="border-[var(--accent-default)]/20 bg-[var(--accent-default)]/5">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-[var(--accent-default)] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm mb-1">Season snapshots</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Derived from recorded season totals for the selected season and sport (same
                  aggregates as the leaderboard below).
                </p>
                {aggregateInsights.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Need more logged games before narratives appear.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {aggregateInsights.map((row) => (
                      <li key={row.id} className="flex gap-2 text-sm">
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            row.tone === 'positive'
                              ? 'bg-[var(--success)]'
                              : row.tone === 'watch'
                                ? 'bg-[var(--warning)]'
                                : 'bg-[var(--text-muted)]'
                          }`}
                        />
                        <span className="text-[var(--text-secondary)]">
                          {row.parts.map((part, idx) =>
                            part.type === 'link' ? (
                              <Link
                                key={idx}
                                to={part.href}
                                className="text-[var(--accent-default)] hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)] rounded-sm"
                              >
                                {part.value}
                              </Link>
                            ) : (
                              <span key={idx}>{part.value}</span>
                            ),
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--text-muted)]">Automated insights</h3>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={insightsRefreshing}
              disabled={!effectiveSeasonId || insightsRefreshing}
              icon={insightsRefreshing ? undefined : <RefreshCw className="w-4 h-4" />}
              onClick={() => void runInsightsBackfill()}
            >
              {insightsRefreshing ? 'Scanning matches…' : 'Refresh insights'}
            </Button>
          </div>
          {insights.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ['all', 'All'],
                  ['debuts', 'Debuts'],
                  ['trending', 'Trending'],
                  ['team', 'Team form'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInsightFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    insightFilter === key
                      ? 'bg-[var(--accent-default)] text-white border-[var(--accent-default)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {insights.length === 0 ? (
            <Card className="text-center py-12">
              <Lightbulb className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-4">
                Insights appear after the first completed match — debut standouts, win streaks, and
                score trends. Use Refresh insights if this section stays empty after ending matches.
              </p>
              {!insightsRefreshing && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void runInsightsBackfill()}
                >
                  Scan recent matches now
                </Button>
              )}
              {insightsRefreshing && (
                <p className="text-xs text-[var(--text-muted)] inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Scanning up to 40 recent matches…
                </p>
              )}
            </Card>
          ) : filteredInsights.length === 0 ? (
            <Card className="text-center py-8 text-[var(--text-muted)] text-sm">
              No insights in this filter yet.
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredInsights.map((insight) => {
                const expanded = expandedInsightId === insight.id
                return (
                  <div
                    key={insight.id}
                    role="button"
                    tabIndex={0}
                    className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)] cursor-pointer"
                    onClick={() => setExpandedInsightId(expanded ? null : insight.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setExpandedInsightId(expanded ? null : insight.id)
                      }
                    }}
                  >
                    <Card className="flex gap-3 hover:border-[var(--accent-default)]/35 transition-colors">
                      <div
                        className={`w-1 rounded-full flex-shrink-0 ${
                          insight.insight_type === 'trending_up' ||
                          insight.insight_type === 'debut_standout' ||
                          insight.insight_type === 'first_win'
                            ? 'bg-[var(--success)]'
                            : insight.insight_type === 'trending_down'
                              ? 'bg-[var(--danger)]'
                              : 'bg-[var(--warning)]'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge
                            size="sm"
                            variant={insight.entity_type === 'player' ? 'info' : 'default'}
                          >
                            {formatEnumLabel(insight.entity_type)}
                          </Badge>
                          <Badge
                            size="sm"
                            variant={
                              insight.insight_type === 'trending_up' ||
                              insight.insight_type === 'debut_standout' ||
                              insight.insight_type === 'first_win'
                                ? 'success'
                                : insight.insight_type === 'trending_down'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {formatEnumLabel(insight.insight_type)}
                          </Badge>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-[var(--text-muted)] ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                        <p className="text-sm">{insight.insight_text}</p>
                        {expanded && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <InsightExpandedDetail insight={insight} />
                            <InsightActions insight={insight} />
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Champions and runners-up from completed knockout events in this season (
            {getSportLabel(sport as any)}). Round-robin–only events may not appear until a final
            bracket slot exists.
          </p>
          {loading ? (
            <Skeleton className="h-40" />
          ) : eventPodiums.length === 0 ? (
            <Card className="text-center py-12 text-[var(--text-muted)] text-sm">
              No finished bracket results for this sport yet.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Event
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Champion
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Runner-up
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)]" />
                  </tr>
                </thead>
                <tbody>
                  {eventPodiums.map((row) => {
                    const champ = row.placements.find((p) => p.rank === 1)
                    const runner = row.placements.find((p) => p.rank === 2)
                    return (
                      <tr
                        key={row.event.id}
                        className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] cursor-pointer hover:bg-[var(--surface-elevated)]"
                        onClick={() => navigate(`/organizer/events/${row.event.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-[var(--warning)] shrink-0" />
                            <span className="font-medium">{row.event.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {champ ? (podiumLabels[champ.participantId] ?? '—') : '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {runner ? (podiumLabels[runner.participantId] ?? '—') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge size="sm" variant="info">
                            Open
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'scoresheets' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Finalized matches for this season ({getSportLabel(sport as any)}). Each one links to its
            match score sheet.
          </p>
          {scoreSheetsLoading ? (
            <Skeleton className="h-40" />
          ) : finalizedMatches.length === 0 ? (
            <Card className="text-center py-12 text-[var(--text-muted)] text-sm">
              No finalized matches for this sport yet.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Event
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Teams
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Final Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Winner
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                      Finalized
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {finalizedMatches.map((m) => (
                    <tr
                      key={m.matchId}
                      className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] cursor-pointer hover:bg-[var(--surface-elevated)]"
                      onClick={() => navigate(`/organizer/match-review/${m.matchId}/score-sheet`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <span className="font-medium">
                            {m.eventName}
                            {m.round ? ` · Round ${m.round}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {m.nameA} vs {m.nameB}
                      </td>
                      <td className="px-4 py-3">{m.finalScoreLabel}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {m.winnerName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {m.finalizedAt ? formatDate(m.finalizedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'teams' && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-elevated)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                  Team
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                  W
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                  L
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                  Win%
                </th>
              </tr>
            </thead>
            <tbody>
              {teamStatsForSport.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-[var(--text-muted)]">
                    No team stats yet
                  </td>
                </tr>
              ) : (
                teamStatsForSport.map((ts) => (
                  <tr
                    key={ts.id}
                    role={ts.team_id ? 'button' : undefined}
                    tabIndex={ts.team_id ? 0 : undefined}
                    className={`border-t border-[var(--border-subtle)] bg-[var(--surface-card)] ${
                      ts.team_id
                        ? 'cursor-pointer hover:bg-[var(--surface-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)]'
                        : ''
                    }`}
                    onClick={() => ts.team_id && navigate(`/guest/teams/${ts.team_id}`)}
                    onKeyDown={(e) => {
                      if (!ts.team_id) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/guest/teams/${ts.team_id}`)
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-medium">
                      {ts.team?.name ?? '—'}
                      {ts.team_id ? (
                        <span className="text-[var(--text-muted)] ml-1.5" aria-hidden>
                          ›
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-[var(--success)]">
                      {ts.wins}
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--danger)]">{ts.losses}</td>
                    <td className="px-4 py-3 text-center">
                      {ts.wins + ts.losses > 0
                        ? Math.round((ts.wins / (ts.wins + ts.losses)) * 100)
                        : 0}
                      %
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
