import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
import { Card, TabBar, Button, Select, Input } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { getSportLabel } from '../../lib/utils'
import type { Season } from '../../types'

function formatSeasonSelectLabel(s: Season): string {
  if (s.status === 'active') return `${s.name} · Active`
  if (s.status === 'completed') return `${s.name} · Completed`
  if (s.status === 'archived') return `${s.name} · Archived`
  return s.name
}

export default function GuestLeaderboards() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const sport = searchParams.get('sport') ?? 'basketball'
  const seasonParam = searchParams.get('season')

  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [seasonListQuery, setSeasonListQuery] = useState('')
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [teamStandings, setTeamStandings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('players')
  const [athleteSearch, setAthleteSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSeasonsLoading(true)
      const { data, error } = await supabase
        .from('seasons')
        .select('id, name, status, start_date, end_date, created_at')
        .in('status', ['active', 'completed', 'archived'])
        .order('start_date', { ascending: false, nullsFirst: false })
      if (cancelled) return
      if (error) {
        setSeasons([])
      } else {
        setSeasons((data ?? []) as Season[])
      }
      setSeasonsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveSeasonId = useMemo(() => {
    if (!seasons.length) return null
    if (seasonParam && seasons.some((s) => s.id === seasonParam)) return seasonParam
    const active = seasons.find((s) => s.status === 'active')
    return active?.id ?? seasons[0]?.id ?? null
  }, [seasons, seasonParam])

  const seasonSelectOptions = useMemo(() => {
    const q = seasonListQuery.trim().toLowerCase()
    let list = q ? seasons.filter((s) => s.name.toLowerCase().includes(q)) : seasons
    const selId = effectiveSeasonId
    if (selId && !list.some((s) => s.id === selId)) {
      const sel = seasons.find((s) => s.id === selId)
      if (sel) list = [sel, ...list]
    }
    return list.map((s) => ({ value: s.id, label: formatSeasonSelectLabel(s) }))
  }, [seasons, seasonListQuery, effectiveSeasonId])

  const filteredLeaderboard = useMemo(() => {
    const q = athleteSearch.trim().toLowerCase()
    if (!q) return leaderboard
    return leaderboard.filter((p) =>
      (p.athlete?.profile?.full_name ?? '').toLowerCase().includes(q),
    )
  }, [leaderboard, athleteSearch])

  useEffect(() => {
    if (!effectiveSeasonId) {
      setLeaderboard([])
      setTeamStandings([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const loadData = async () => {
      const [lb, ts] = await Promise.all([
        supabase
          .from('player_season_stats')
          .select(
            '*, athlete:athletes(student_id, position, profile:profiles!athletes_profile_id_fkey(full_name))',
          )
          .eq('sport', sport)
          .eq('season_id', effectiveSeasonId)
          .order('games_played', { ascending: false })
          .limit(100),
        supabase
          .from('team_season_stats')
          .select('*, team:teams(id, name, sport)')
          .eq('season_id', effectiveSeasonId)
          .order('wins', { ascending: false }),
      ])

      if (cancelled) return
      setLeaderboard(lb.data ?? [])
      setTeamStandings((ts as { data: any[] | null }).data ?? [])
      setLoading(false)
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [sport, effectiveSeasonId])

  const setSportPreserveSeason = (nextSport: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('sport', nextSport)
    setSearchParams(next)
  }

  const handleSeasonChange = (seasonId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('season', seasonId)
    setSearchParams(next)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft className="w-4 h-4" />}
          className="shrink-0 -ml-1"
          onClick={() => navigate('/guest')}
          aria-label="Back to hub"
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Standings & Leaderboards</h1>
          <p className="text-[var(--text-muted)] text-sm">Season statistics and rankings</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex gap-2 flex-wrap">
          {['basketball', 'volleyball', 'table-tennis'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSportPreserveSeason(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${sport === s ? 'bg-[var(--school-primary)] text-[var(--school-secondary)]' : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              {getSportLabel(s as any)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 w-full lg:w-auto lg:max-w-xl">
          <Input
            label="Find season"
            placeholder="Filter season list…"
            value={seasonListQuery}
            onChange={(e) => setSeasonListQuery(e.target.value)}
            icon={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
            className="min-w-[200px] flex-1 sm:flex-none sm:w-52"
            disabled={seasonsLoading || seasons.length === 0}
          />
          <Select
            label="Season"
            value={effectiveSeasonId ?? ''}
            onChange={(e) => handleSeasonChange(e.target.value)}
            options={
              seasonSelectOptions.length > 0
                ? seasonSelectOptions
                : [
                    {
                      value: '',
                      label: seasonsLoading ? 'Loading seasons…' : 'No seasons available',
                    },
                  ]
            }
            disabled={seasonsLoading || !effectiveSeasonId || seasons.length === 0}
            className="min-w-[220px] flex-1 sm:flex-none sm:w-64"
          />
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'players', label: 'Player Stats' },
          { id: 'teams', label: 'Team Standings' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'players' && (
        <>
          <Input
            label="Search athletes"
            placeholder="Filter by name…"
            value={athleteSearch}
            onChange={(e) => setAthleteSearch(e.target.value)}
            icon={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
            className="max-w-md"
          />
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-elevated)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] w-10">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">
                    Athlete
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                    GP
                  </th>
                  {sport === 'basketball' && (
                    <>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                        PPG
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                        RPG
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                        APG
                      </th>
                    </>
                  )}
                  {sport === 'volleyball' && (
                    <>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                        Kills
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                        Aces
                      </th>
                    </>
                  )}
                  {sport === 'table-tennis' && (
                    <>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-muted)]">
                        Win%
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading || seasonsLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-[var(--border-subtle)]">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-[var(--surface-elevated)] rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !effectiveSeasonId ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-[var(--text-muted)]">
                      No seasons available yet.
                    </td>
                  </tr>
                ) : filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-[var(--text-muted)]">
                      {athleteSearch.trim()
                        ? 'No athletes match your search.'
                        : 'No stats yet for this season.'}
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard.map((p, i) => (
                    <tr
                      key={p.id}
                      className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] cursor-pointer"
                      onClick={() => navigate(`/guest/athletes/${p.athlete_id}`)}
                    >
                      <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {p.athlete?.profile?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">{p.games_played}</td>
                      {sport === 'basketball' && (
                        <>
                          <td className="px-4 py-3 text-center font-bold">
                            {p.games_played > 0
                              ? ((p.stats?.total_points ?? 0) / p.games_played).toFixed(1)
                              : '0.0'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.games_played > 0
                              ? ((p.stats?.total_rebounds ?? 0) / p.games_played).toFixed(1)
                              : '0.0'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.games_played > 0
                              ? ((p.stats?.total_assists ?? 0) / p.games_played).toFixed(1)
                              : '0.0'}
                          </td>
                        </>
                      )}
                      {sport === 'volleyball' && (
                        <>
                          <td className="px-4 py-3 text-center font-bold">{p.stats?.kills ?? 0}</td>
                          <td className="px-4 py-3 text-center">{p.stats?.aces ?? 0}</td>
                        </>
                      )}
                      {sport === 'table-tennis' && (
                        <>
                          <td className="px-4 py-3 text-center font-bold">
                            {p.stats?.win_pct ?? '0'}%
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'teams' && (
        <div className="space-y-2">
          {loading || seasonsLoading ? (
            <p className="text-center text-[var(--text-muted)] py-10">Loading standings…</p>
          ) : !effectiveSeasonId ? (
            <p className="text-center text-[var(--text-muted)] py-10">No seasons available yet.</p>
          ) : teamStandings.filter((ts) => !sport || ts.team?.sport === sport).length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-10">No team standings yet</p>
          ) : (
            teamStandings
              .filter((ts) => !sport || ts.team?.sport === sport)
              .map((ts, i) => (
                <Card
                  key={ts.id}
                  className="flex items-center gap-4 cursor-pointer hover:border-white/20 transition-colors"
                  onClick={() => ts.team?.id && navigate(`/guest/teams/${ts.team.id}`)}
                >
                  <span className="text-lg font-bold text-[var(--text-muted)] w-6 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-bold">{ts.team?.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ts.team?.sport ? getSportLabel(ts.team.sport as any) : '—'}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-[var(--success)] font-bold">{ts.wins}W</span>
                    <span className="text-[#FF3355]">{ts.losses}L</span>
                    <span className="text-[var(--text-muted)]">
                      {ts.wins + ts.losses > 0
                        ? Math.round((ts.wins / (ts.wins + ts.losses)) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                </Card>
              ))
          )}
        </div>
      )}
    </div>
  )
}
