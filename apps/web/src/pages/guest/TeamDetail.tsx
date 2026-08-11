import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Card, Badge, Skeleton, Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { getSportLabel, getSportIcon, formatDateTime } from '../../lib/utils'

function matchStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled'
    case 'live':
      return 'Live now'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export default function GuestTeamDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [team, setTeam] = useState<any>(null)
  const [roster, setRoster] = useState<any[]>([])
  const [coaches, setCoaches] = useState<string[]>([])
  const [stats, setStats] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    Promise.all([
      supabase.from('teams').select('id, name, sport').eq('id', id).maybeSingle(),
      supabase
        .from('team_members')
        .select(
          'lineup_slot, athlete:athletes(id, position, jersey_number, profile:profiles!athletes_profile_id_fkey(full_name))',
        )
        .eq('team_id', id),
      supabase
        .from('team_coaches')
        .select('organizer:organizers(profile:profiles!organizers_profile_id_fkey(full_name))')
        .eq('team_id', id),
      supabase
        .from('team_season_stats')
        .select('*')
        .eq('team_id', id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('matches')
        .select(
          'id, scheduled_at, status, participant_a_id, participant_b_id, scores:match_scores(*), event:events(name, sport)',
        )
        .or(`participant_a_id.eq.${id},participant_b_id.eq.${id}`)
        .order('scheduled_at', { ascending: false })
        .limit(20),
    ])
      .then(async ([t, members, coachRows, ts, m]) => {
        if (cancelled) return
        setTeam(t.data)
        setRoster(
          (members.data ?? [])
            .filter((r: any) => r.athlete)
            .map((r: any) => ({ ...r.athlete, lineup_slot: r.lineup_slot }))
            .sort((a: any, b: any) => {
              // Starters first (by slot number), then bench — mirrors the athlete
              // dashboard's "Starting / Bench" roster modal.
              if (a.lineup_slot != null && b.lineup_slot != null) return a.lineup_slot - b.lineup_slot
              if (a.lineup_slot != null) return -1
              if (b.lineup_slot != null) return 1
              return (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '')
            }),
        )
        setCoaches(
          (coachRows.data ?? [])
            .map((r: any) => r.organizer?.profile?.full_name?.trim())
            .filter((n: string | undefined) => !!n),
        )
        setStats(ts.data)

        const matchRows = m.data ?? []
        const opponentIds = new Set<string>()
        for (const row of matchRows) {
          const opp = row.participant_a_id === id ? row.participant_b_id : row.participant_a_id
          if (opp) opponentIds.add(opp)
        }
        const labels: Record<string, string> = {}
        if (opponentIds.size > 0) {
          const [teamsRes, athletesRes] = await Promise.all([
            supabase
              .from('teams')
              .select('id, name')
              .in('id', [...opponentIds]),
            supabase
              .from('athletes')
              .select('id, profile:profiles!athletes_profile_id_fkey(full_name)')
              .in('id', [...opponentIds]),
          ])
          for (const row of teamsRes.data ?? []) labels[row.id] = row.name
          for (const row of athletesRes.data ?? []) {
            const name = (row as any).profile?.full_name
            if (name) labels[row.id] = name
          }
        }
        if (!cancelled) {
          setMatches(
            matchRows.map((row: any) => {
              const oppId =
                row.participant_a_id === id ? row.participant_b_id : row.participant_a_id
              return { ...row, opponentName: oppId ? (labels[oppId] ?? 'TBD') : 'TBD' }
            }),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const goBack = () => navigate(-1)

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
  if (!team)
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
        <div className="text-center py-16 text-[var(--text-muted)]">Team not found</div>
      </div>
    )

  const wins = stats?.wins ?? 0
  const losses = stats?.losses ?? 0
  const totalGames = wins + losses
  const winPct = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0

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
        <div className="w-16 h-16 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-3xl">
          {getSportIcon(team.sport as any)}
        </div>
        <div>
          <h1 className="font-bold text-xl">{team.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">{getSportLabel(team.sport as any)}</p>
        </div>
      </Card>

      {stats && (
        <Card>
          <h3 className="font-bold mb-4">Season Record</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-black font-[Barlow_Condensed] text-[var(--success)]">
                {wins}
              </p>
              <p className="text-xs text-[var(--text-muted)]">W</p>
            </div>
            <div>
              <p className="text-2xl font-black font-[Barlow_Condensed] text-[#FF3355]">{losses}</p>
              <p className="text-xs text-[var(--text-muted)]">L</p>
            </div>
            <div>
              <p className="text-2xl font-black font-[Barlow_Condensed]">{winPct}%</p>
              <p className="text-xs text-[var(--text-muted)]">Win%</p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-bold mb-3">Roster ({roster.length})</h3>
        {roster.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No roster yet.</p>
        ) : (
          <div className="space-y-2">
            {roster.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0 cursor-pointer hover:text-[var(--accent-default)]"
                onClick={() => navigate(`/guest/athletes/${a.id}`)}
              >
                <div>
                  <p className="font-medium">{a.profile?.full_name ?? 'Athlete'}</p>
                  {a.position && <p className="text-xs text-[var(--text-muted)]">{a.position}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {a.lineup_slot != null && (
                    <Badge size="sm" variant="success">
                      Starting
                    </Badge>
                  )}
                  {a.jersey_number && <Badge size="sm">#{a.jersey_number}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {coaches.length > 0 && (
        <Card>
          <h3 className="font-bold mb-3">Coaches</h3>
          <div className="flex flex-wrap gap-2">
            {coaches.map((c) => (
              <Badge key={c} size="sm">
                {c}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-bold mb-3">Matches</h3>
        {matches.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No matches yet.</p>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => {
              const scores: any[] = m.scores ?? []
              const myScore = scores.find((s) => s.participant_id === id)
              const oppScore = scores.find((s) => s.participant_id !== id)
              const scoreLine =
                (m.status === 'completed' || m.status === 'live') && myScore && oppScore
                  ? `${myScore.total ?? 0} - ${oppScore.total ?? 0}`
                  : null
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <div>
                    <p className="font-medium">vs {m.opponentName}</p>
                    <p className="text-xs text-[var(--text-muted)]">{m.event?.name}</p>
                    {m.scheduled_at && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatDateTime(m.scheduled_at)}
                      </p>
                    )}
                  </div>
                  {scoreLine ? (
                    <span className="font-black text-lg">{scoreLine}</span>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">
                      {matchStatusLabel(m.status)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
