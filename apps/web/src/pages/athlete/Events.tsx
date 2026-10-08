import React, { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui'
import PageHeader from '../../components/layout/PageHeader'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, eventPublicLifecycleLabel } from '../../lib/utils'
import SportIcon from '../../components/ui/SportIcon'
import SearchInput, { matchesSearch } from '../../components/ui/SearchInput'

export default function AthleteEvents() {
  const { athlete } = useAuthStore()
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!athlete) {
      // Without this the skeleton below would never stop: the effect used to
      // bail out while `loading` stayed true for anyone whose athlete record
      // hadn't resolved yet.
      setLoading(false)
      return
    }
    let cancelled = false
    /*
      Three separate queries rather than one nested select. `event_participants
      .participant_id` holds either a team id or an athlete id, so it carries no
      foreign key to `teams` (migration 004) -- asking PostgREST to embed
      teams -> event_participants -> events makes it reject the whole request
      with "could not find a relationship". The old code ignored that error and
      rendered an empty list, which is why this page was always blank. Same
      team-ids-then-participants shape the dashboard already uses.
    */
    ;(async () => {
      try {
        const { data: tm, error: tmError } = await supabase
          .from('team_members')
          .select('team_id, team:teams(id, name, sport)')
          .eq('athlete_id', athlete.id)
        if (tmError) throw tmError

        // Cast through `unknown`: the generated types model an embed as an
        // array, while a to-one join like this returns a single object.
        const teamRows = (tm ?? []) as unknown as Array<{
          team_id: string
          team?: { id: string; name?: string; sport?: string } | null
        }>
        const teamNameById = new Map<string, string>()
        for (const row of teamRows) {
          if (row.team?.id && row.team.name) teamNameById.set(row.team.id, row.team.name)
        }
        const teamIds = [...new Set(teamRows.map((t) => t.team_id))]
        if (teamIds.length === 0) {
          if (!cancelled) setMatches([])
          return
        }

        const { data: eps, error: epError } = await supabase
          .from('event_participants')
          .select('event_id, participant_id')
          .in('participant_id', teamIds)
        if (epError) throw epError

        const participantsByEvent = new Map<string, string[]>()
        for (const ep of (eps ?? []) as Array<{ event_id: string; participant_id: string }>) {
          const list = participantsByEvent.get(ep.event_id) ?? []
          list.push(ep.participant_id)
          participantsByEvent.set(ep.event_id, list)
        }
        const eventIds = [...participantsByEvent.keys()]
        if (eventIds.length === 0) {
          if (!cancelled) setMatches([])
          return
        }

        const { data: evs, error: evError } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds)
        if (evError) throw evError

        const rows = ((evs ?? []) as Array<Record<string, unknown> & { id: string }>).map((ev) => {
          const names = (participantsByEvent.get(ev.id) ?? [])
            .map((pid) => teamNameById.get(pid))
            .filter((n): n is string => Boolean(n))
          return { ...ev, teamName: [...new Set(names)].join(', ') || undefined }
        })
        if (!cancelled) setMatches(rows)
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [athlete])

  return (
    <div className="space-y-6">
      <PageHeader title="My Events" subtitle="Events you're participating in" />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="w-10 h-10" aria-hidden />}
          title="No events yet"
          description="You haven't been added to any events. Check with your organizer."
        />
      ) : (
        <div className="space-y-3">
          {matches.length > 3 && (
            <SearchInput value={search} onChange={setSearch} placeholder="Event, sport or team" />
          )}
          {matches
            .filter((e) =>
              matchesSearch(search, e.name, e.teamName, getSportLabel(e.sport as any), e.status),
            )
            .map((e) => (
            <Card key={e.id} className="flex items-center gap-4">
              <SportIcon sport={e.sport} className="w-7 h-7" />
              <div className="flex-1">
                <h3 className="font-bold">{e.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {getSportLabel(e.sport as any)} · {e.teamName}
                </p>
              </div>
              <Badge
                variant={
                  e.status === 'in_progress'
                    ? 'danger'
                    : e.status === 'completed'
                      ? 'success'
                      : 'default'
                }
              >
                {eventPublicLifecycleLabel(e.status)}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
