import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Card, Badge, Skeleton, Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { getSportLabel, getSportIcon, getInitials } from '../../lib/utils'

export default function GuestAthleteProfile() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [athlete, setAthlete] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [insights, setInsights] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('athletes')
        .select('*, profile:profiles!athletes_profile_id_fkey(full_name, avatar_url)')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('player_season_stats')
        .select('*')
        .eq('athlete_id', id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('insights')
        .select('*')
        .eq('entity_type', 'player')
        .eq('entity_id', id)
        .limit(3),
      // Team name + sport only (no coach names) — teams/team_members RLS is
      // fully public, matches the query already used on the athlete's own
      // profile (pages/athlete/Profile.tsx), trimmed of the coach join.
      supabase.from('team_members').select('team_id, team:teams(id, name, sport)').eq('athlete_id', id),
    ])
      .then(([a, s, ins, tm]) => {
        setAthlete(a.data)
        setStats(s.data)
        setInsights(ins.data ?? [])
        setTeams(((tm.data ?? []) as any[]).map((row) => row.team).filter(Boolean))
      })
      .finally(() => setLoading(false))
  }, [id])

  const goBack = () => {
    navigate(-1)
  }

  if (loading)
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
          className="-ml-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={goBack}
        >
          Back
        </Button>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  if (!athlete)
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
          className="-ml-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={goBack}
        >
          Back
        </Button>
        <div className="text-center py-16 text-[var(--text-muted)]">Athlete not found</div>
      </div>
    )

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={<ArrowLeft className="w-4 h-4" />}
        className="-ml-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        onClick={goBack}
      >
        Back
      </Button>

      <Card className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-xl font-bold text-[var(--school-secondary)]">
          {getInitials(athlete.profile?.full_name ?? '?')}
        </div>
        <div>
          <h1 className="font-bold text-xl">{athlete.profile?.full_name}</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {getSportIcon(athlete.sport as any)} {getSportLabel(athlete.sport as any)}
          </p>
          <div className="flex gap-2 mt-2">
            <Badge size="sm">{athlete.position}</Badge>
            {athlete.jersey_number && <Badge size="sm">#{athlete.jersey_number}</Badge>}
            <Badge size="sm">{athlete.year_level}</Badge>
          </div>
        </div>
      </Card>

      {teams.length > 0 && (
        <Card>
          <h3 className="font-bold mb-3">Team</h3>
          <div className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span>{getSportIcon(t.sport as any)}</span>
                <span className="font-medium">{t.name}</span>
                <span className="text-[var(--text-muted)]">· {getSportLabel(t.sport as any)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stats && (
        <Card>
          <h3 className="font-bold mb-4">Season Stats</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-black font-[Barlow_Condensed]">{stats.games_played}</p>
              <p className="text-xs text-[var(--text-muted)]">GP</p>
            </div>
            {athlete.sport === 'basketball' && (
              <>
                <div>
                  <p className="text-2xl font-black font-[Barlow_Condensed]">
                    {stats.games_played > 0
                      ? ((stats.stats?.total_points ?? 0) / stats.games_played).toFixed(1)
                      : '0.0'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">PPG</p>
                </div>
                <div>
                  <p className="text-2xl font-black font-[Barlow_Condensed]">
                    {stats.games_played > 0
                      ? ((stats.stats?.total_rebounds ?? 0) / stats.games_played).toFixed(1)
                      : '0.0'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">RPG</p>
                </div>
              </>
            )}
            {athlete.sport === 'volleyball' && (
              <>
                <div>
                  <p className="text-2xl font-black font-[Barlow_Condensed]">
                    {stats.stats?.kills ?? 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Kills</p>
                </div>
                <div>
                  <p className="text-2xl font-black font-[Barlow_Condensed]">
                    {stats.stats?.aces ?? 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Aces</p>
                </div>
              </>
            )}
            {athlete.sport === 'table-tennis' && (
              <>
                <div>
                  <p className="text-2xl font-black font-[Barlow_Condensed]">
                    {stats.stats?.mw ?? 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Wins</p>
                </div>
                <div>
                  <p className="text-2xl font-black font-[Barlow_Condensed]">
                    {stats.stats?.win_pct ?? '0'}%
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Win%</p>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {insights.length > 0 && (
        <Card>
          <h3 className="font-bold mb-3">Performance Insights</h3>
          {insights.map((i) => (
            <div
              key={i.id}
              className="text-sm py-2 border-b border-[var(--border-subtle)] last:border-0"
            >
              {i.insight_text}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
