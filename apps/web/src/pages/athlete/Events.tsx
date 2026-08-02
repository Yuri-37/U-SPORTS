import React, { useEffect, useState } from 'react'
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, eventPublicLifecycleLabel } from '../../lib/utils'

export default function AthleteEvents() {
  const { athlete } = useAuthStore()
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!athlete) return
    // Find team_members for this athlete, then matches for their teams
    supabase
      .from('team_members')
      .select('team_id, team:teams(id, name, sport, events:event_participants(event:events(*)))')
      .eq('athlete_id', athlete.id)
      .then(({ data }) => {
        const byEventId = new Map<string, Record<string, unknown> & { id: string; teamName?: string }>()
        for (const tm of data ?? []) {
          const rows = tm as { team?: { name?: string; events?: Array<{ event?: Record<string, unknown> & { id?: string } }> } }
          for (const ep of rows.team?.events ?? []) {
            const ev = ep.event as (Record<string, unknown> & { id?: string }) | null | undefined
            const id = typeof ev?.id === 'string' ? ev.id : undefined
            if (!id) continue

            const tname = rows.team?.name
            const existing = byEventId.get(id)
            if (!existing) {
              byEventId.set(id, {
                ...(ev as Record<string, unknown> & { id: string }),
                teamName: tname,
              } as Record<string, unknown> & { id: string; teamName?: string })
              continue
            }

            const parts = [...String(existing.teamName ?? '').split(',').map((s) => s.trim()).filter(Boolean)]
            if (tname && !parts.includes(tname)) parts.push(tname)
            if (parts.length > 0) existing.teamName = parts.join(', ')
          }
        }
        setMatches([...byEventId.values()])
        setLoading(false)
      })
  }, [athlete])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Events</h1>
        <p className="text-[var(--text-muted)] text-sm">Events you're participating in</p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : matches.length === 0 ? (
        <EmptyState icon="📅" title="No events yet" description="You haven't been added to any events. Check with your organizer." />
      ) : (
        <div className="space-y-3">
          {matches.map(e => (
            <Card key={e.id} className="flex items-center gap-4">
              <span className="text-3xl">{getSportIcon(e.sport as any)}</span>
              <div className="flex-1">
                <h3 className="font-bold">{e.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">{getSportLabel(e.sport as any)} · {e.teamName}</p>
              </div>
              <Badge variant={e.status === 'in_progress' ? 'danger' : e.status === 'completed' ? 'success' : 'default'}>
                {eventPublicLifecycleLabel(e.status)}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
