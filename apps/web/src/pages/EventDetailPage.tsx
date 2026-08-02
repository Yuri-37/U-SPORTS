import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { Tv2, ArrowLeft, ChevronRight } from 'lucide-react'
import { Card, Badge, Button, Skeleton, TabBar } from '../components/ui'
import { supabase } from '../lib/supabase'
import api from '../lib/api'
import { cn, getSportLabel, getSportIcon, formatDateTime, formatEnumLabel, eventPublicLifecycleLabel } from '../lib/utils'
import BracketView from '../components/brackets/BracketView'
import PublicMatchDetailModal from '../components/events/PublicMatchDetailModal'
import EventPodiumStrip from '../components/events/EventPodiumStrip'
import { collectBracketParticipantIds, fetchParticipantLabels } from '../lib/participantLabels'
import { deriveEliminationPodium } from '../lib/eventPlacements'
import type { Event, Bracket, Match } from '../types'

function tabFromSearch(v: string | null): 'bracket' | 'matches' {
  return v === 'matches' ? 'matches' : 'bracket'
}

export type EventDetailPageProps = {
  backPath: string
  backAriaLabel: string
  /** Extra layout classes (e.g. guest hub pages use horizontal padding). */
  outerClassName?: string
}

export default function EventDetailPage({ backPath, backAriaLabel, outerClassName }: EventDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [event, setEvent] = useState<Event | null>(null)
  const [brackets, setBrackets] = useState<Bracket[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'bracket' | 'matches'>(() => tabFromSearch(searchParams.get('tab')))
  const [participantLabels, setParticipantLabels] = useState<Record<string, string>>({})
  const [matchDetailId, setMatchDetailId] = useState<string | null>(null)

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')))
  }, [searchParams])

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get(`/events/${id}`),
      api.get(`/brackets/${id}`),
      api.get(`/events/${id}/matches`),
    ])
      .then(([ev, br, mt]) => {
        setEvent(ev.data)
        setBrackets(br.data)
        setMatches(mt.data)
      })
      .finally(() => setLoading(false))

    const channel = supabase
      .channel(`event-detail-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'brackets', filter: `event_id=eq.${id}` },
        () => api.get(`/brackets/${id}`).then((r) => setBrackets(r.data))
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'match_scores' }, () =>
        api.get(`/events/${id}/matches`).then((r) => setMatches(r.data))
      )
      .subscribe()
    return () => {
      channel.unsubscribe()
    }
  }, [id])

  useEffect(() => {
    const bracketIds = collectBracketParticipantIds(brackets)
    const matchIds = matches.flatMap((m) => [m.participant_a_id, m.participant_b_id].filter((x): x is string => !!x))
    const ids = [...new Set([...bracketIds, ...matchIds])]
    if (ids.length === 0) {
      setParticipantLabels({})
      return
    }
    let cancelled = false
    void fetchParticipantLabels(ids).then((m) => {
      if (!cancelled) setParticipantLabels(m)
    })
    return () => {
      cancelled = true
    }
  }, [brackets, matches])

  const podium = useMemo(() => deriveEliminationPodium(brackets), [brackets])

  const handleTabChange = (next: string) => {
    const idTab = next === 'matches' ? 'matches' : 'bracket'
    setTab(idTab)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (idTab === 'bracket') n.delete('tab')
        else n.set('tab', idTab)
        return n
      },
      { replace: true }
    )
  }

  if (loading)
    return (
      <div className={cn('max-w-4xl mx-auto space-y-4', outerClassName)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (!event) return <div className="text-center py-12 text-[var(--text-muted)]">Event not found</div>

  return (
    <div className={cn('max-w-4xl mx-auto space-y-6', outerClassName)}>
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft className="w-4 h-4" />}
          className="shrink-0 -ml-1"
          onClick={() => navigate(backPath)}
          aria-label={backAriaLabel}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{getSportIcon(event.sport as any)}</span>
            <h1 className="text-2xl font-bold">{event.name}</h1>
          </div>
          <p className="text-[var(--text-muted)] text-sm capitalize">
            {getSportLabel(event.sport as any)} · {formatEnumLabel(event.format ?? '')}
          </p>
          {event.description ? (
            <p className="text-sm text-[var(--text-secondary)] mt-3 whitespace-pre-wrap">{event.description}</p>
          ) : null}
        </div>
        <Badge
          variant={
            event.status === 'in_progress'
              ? 'danger'
              : event.status === 'completed'
                ? 'success'
                : event.status === 'registration'
                  ? 'info'
                  : 'default'
          }
        >
          {eventPublicLifecycleLabel(event.status)}
        </Badge>
      </div>

      <TabBar
        tabs={[
          { id: 'bracket', label: 'Bracket' },
          { id: 'matches', label: `Matches (${matches.length})` },
        ]}
        active={tab}
        onChange={handleTabChange}
      />

      {event.status === 'completed' && podium && podium.length > 0 ? (
        <EventPodiumStrip placements={podium} labelByParticipantId={participantLabels} title="Final standings" />
      ) : null}

      {tab === 'bracket' && (
        <BracketView
          brackets={brackets}
          matches={matches}
          participantLabels={participantLabels}
          onMatchClick={(m) => setMatchDetailId(m.id)}
        />
      )}

      {tab === 'matches' && (
        <div className="space-y-3">
          {matches.map((m) => {
            const labelA = m.participant_a_id
              ? participantLabels[m.participant_a_id] ?? `Team ${m.participant_a_id.slice(0, 6)}`
              : 'TBD'
            const labelB = m.participant_b_id
              ? participantLabels[m.participant_b_id] ?? `Team ${m.participant_b_id.slice(0, 6)}`
              : 'TBD'
            return (
              <Card key={m.id} className="flex flex-col sm:flex-row sm:items-stretch p-0 overflow-hidden">
                <button
                  type="button"
                  className="flex flex-1 min-w-0 items-center justify-between gap-3 flex-wrap text-left px-4 py-3 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-inset"
                  onClick={() => setMatchDetailId(m.id)}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {labelA} <span className="text-[var(--text-muted)] font-normal">vs</span> {labelB}
                    </p>
                    {m.scheduled_at && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatDateTime(m.scheduled_at)}
                        {m.venue ? ` · ${m.venue}` : ''}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--text-muted)] shrink-0 hidden sm:block" aria-hidden />
                </button>
                <div className="flex items-center gap-2 shrink-0 px-4 py-3 sm:pl-0 border-t border-[var(--border-subtle)] sm:border-t-0">
                  <Badge variant={m.status === 'live' ? 'danger' : m.status === 'completed' ? 'success' : 'default'} size="sm">
                    {m.status === 'live' ? '● LIVE' : formatEnumLabel(m.status)}
                  </Badge>
                  {m.status === 'live' && (
                    <Button size="sm" icon={<Tv2 className="w-3.5 h-3.5" />} onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}>
                      Watch
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
          {matches.length === 0 && <p className="text-center text-[var(--text-muted)] py-8">No matches yet</p>}
        </div>
      )}

      <PublicMatchDetailModal
        open={matchDetailId !== null}
        onClose={() => setMatchDetailId(null)}
        matchId={matchDetailId}
        sport={event.sport}
      />
    </div>
  )
}
