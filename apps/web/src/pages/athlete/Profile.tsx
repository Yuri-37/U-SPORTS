import React, { useState, useEffect } from 'react'
import { Card, Badge, Button } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { getSportLabel, getSportIcon, getInitials } from '../../lib/utils'
import { Trophy, Users } from 'lucide-react'
import { deriveEliminationPodium, placementRankLabel } from '../../lib/eventPlacements'
import { useNavigate } from 'react-router'
import AvatarUpload from '../../components/settings/AvatarUpload'

type AthleteTeamSummary = {
  teamId: string
  name: string
  sport: string
  coaches: { full_name: string; email: string }[]
}

type ProfileTeamEmbed = {
  id?: string
  name?: string
  sport?: string
  coaches?: Array<{
    organizer?: { profile?: { full_name?: string | null; email?: string | null } | null } | null
  }>
} | null

export default function AthleteProfile() {
  const { profile, athlete } = useAuthStore()
  const navigate = useNavigate()

  // rank is only ever 1 or 2 here in practice (deriveEliminationPodium only),
  // matching the shared EventPlacement.rank type (now `number` to support
  // full per-event rankings elsewhere) rather than a local narrowing.
  type EventFinish = { eventId: string; eventName: string; sport: string; rank: number }
  const [eventFinishes, setEventFinishes] = useState<EventFinish[]>([])
  const [finishesLoading, setFinishesLoading] = useState(false)

  const [myTeamsSummary, setMyTeamsSummary] = useState<AthleteTeamSummary[]>([])
  const [teamsSummaryLoading, setTeamsSummaryLoading] = useState(false)

  useEffect(() => {
    if (!athlete?.id) {
      setEventFinishes([])
      return
    }
    let cancelled = false
    setFinishesLoading(true)
    ;(async () => {
      try {
        const { data: tm } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('athlete_id', athlete.id)
        const teamIds = [...new Set((tm ?? []).map((t: { team_id: string }) => t.team_id))]
        if (teamIds.length === 0) {
          if (!cancelled) setEventFinishes([])
          return
        }
        const { data: eps } = await supabase
          .from('event_participants')
          .select('event_id, participant_id')
          .in('participant_id', teamIds)
        const evIds = [...new Set((eps ?? []).map((e: { event_id: string }) => e.event_id))]
        if (evIds.length === 0) {
          if (!cancelled) setEventFinishes([])
          return
        }
        const { data: evs } = await supabase
          .from('events')
          .select('id,name,sport')
          .in('id', evIds)
          .eq('status', 'completed')

        const out: EventFinish[] = []
        for (const ev of evs ?? []) {
          const myParticipants = new Set(
            (eps ?? [])
              .filter((e: { event_id: string }) => e.event_id === ev.id)
              .map((e: { participant_id: string }) => e.participant_id),
          )
          const { data: br } = await supabase
            .from('brackets')
            .select(
              'round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type',
            )
            .eq('event_id', ev.id)
          const podium = deriveEliminationPodium(br ?? [])
          if (!podium) continue
          const mine = podium.find((p) => myParticipants.has(p.participantId))
          if (!mine) continue
          out.push({
            eventId: ev.id as string,
            eventName: ev.name as string,
            sport: ev.sport as string,
            rank: mine.rank,
          })
        }
        out.sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank
          return a.eventName.localeCompare(b.eventName)
        })
        if (!cancelled) setEventFinishes(out)
      } finally {
        if (!cancelled) setFinishesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [athlete?.id])

  useEffect(() => {
    if (!athlete?.id) {
      setMyTeamsSummary([])
      return
    }
    let cancelled = false
    setTeamsSummaryLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select(
          `
          team_id,
          team:teams(
            id,
            name,
            sport,
            coaches:team_coaches(
              organizer:organizers(profile:profiles!organizers_profile_id_fkey(full_name, email))
            )
          )
        `,
        )
        .eq('athlete_id', athlete.id)
      if (cancelled) return
      setTeamsSummaryLoading(false)
      if (error) {
        setMyTeamsSummary([])
        return
      }
      const seen = new Set<string>()
      const list: AthleteTeamSummary[] = []
      for (const row of data ?? []) {
        const t = row.team as ProfileTeamEmbed
        const tid = (t?.id ?? row.team_id) as string
        if (!tid || seen.has(tid)) continue
        seen.add(tid)
        const coaches: AthleteTeamSummary['coaches'] = []
        for (const c of t?.coaches ?? []) {
          const p = c.organizer?.profile
          const full_name = p?.full_name?.trim()
          if (!full_name) continue
          coaches.push({ full_name, email: String(p?.email ?? '').trim() })
        }
        list.push({
          teamId: tid,
          name: t?.name ?? 'Team',
          sport: (t?.sport as string) ?? athlete.sport,
          coaches,
        })
      }
      setMyTeamsSummary(list)
    })()
    return () => {
      cancelled = true
    }
  }, [athlete?.id, athlete?.sport])

  if (!profile || !athlete)
    return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <Card className="flex items-center gap-6">
        <AvatarUpload size="lg" fallbackInitials={getInitials(profile.full_name)} />
        <div>
          <h2 className="font-bold text-xl">{profile.full_name}</h2>
          <p className="text-[var(--text-muted)] text-sm">{profile.email}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="info">
              {getSportIcon(athlete.sport as any)} {getSportLabel(athlete.sport as any)}
            </Badge>
            <Badge variant={athlete.season_status === 'active' ? 'success' : 'default'}>
              {athlete.season_status}
            </Badge>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-4">Athlete Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Student ID</p>
            <p className="font-mono">{athlete.student_id}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Position</p>
            <p>{athlete.position || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Jersey #</p>
            <p>{athlete.jersey_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Year Level</p>
            <p>{athlete.year_level}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[var(--text-muted)] mb-1">Department</p>
            <p>{athlete.department}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#0066FF]" />
          Your teams
        </h3>
        {teamsSummaryLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : myTeamsSummary.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">You are not on a team roster yet.</p>
        ) : (
          <ul className="space-y-3">
            {myTeamsSummary.map((t) => (
              <li
                key={t.teamId}
                className="border-b border-[var(--border-subtle)] pb-3 last:border-0"
              >
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{getSportLabel(t.sport as any)}</p>
                {t.coaches.length > 0 ? (
                  <p className="text-xs mt-1 text-[var(--text-secondary)]">
                    Coach:{' '}
                    {t.coaches.map((c, i) => (
                      <React.Fragment key={`${t.teamId}-${c.email}-${i}`}>
                        {i > 0 ? ', ' : null}
                        {c.email ? (
                          <a
                            href={`mailto:${encodeURIComponent(c.email)}`}
                            className="text-[#0066FF] hover:underline"
                          >
                            {c.full_name}
                          </a>
                        ) : (
                          <span>{c.full_name}</span>
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] mt-1">No coach assigned yet.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(finishesLoading || eventFinishes.length > 0) && (
        <Card>
          <h3 className="font-bold mb-2 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#FFB800]" />
            Competition placements
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Knockout finishes from completed events where your team reached the final.
          </p>
          {finishesLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : eventFinishes.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No recorded final placements yet.</p>
          ) : (
            <ul className="space-y-1">
              {eventFinishes.map((f) => (
                <li
                  key={f.eventId}
                  className="flex flex-wrap items-center gap-2 justify-between py-2 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{f.eventName}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {getSportLabel(f.sport as any)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={f.rank === 1 ? 'success' : 'info'} size="sm">
                      {placementRankLabel(f.rank)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8"
                      onClick={() => navigate(`/athlete/events/${f.eventId}`)}
                    >
                      Event
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
