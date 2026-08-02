import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
import { Card, Badge, Skeleton, EmptyState, Button, TabBar, Input, Select } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { getSportIcon, getSportLabel, formatEnumLabel, eventPublicLifecycleLabel } from '../../lib/utils'
import type { Event, Sport } from '../../types'

type EventsView = 'upcoming' | 'past'

export default function GuestEvents() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const view: EventsView = searchParams.get('view') === 'past' ? 'past' : 'upcoming'

  const setView = (next: EventsView) => {
    if (next === 'past') setSearchParams({ view: 'past' }, { replace: true })
    else setSearchParams({}, { replace: true })
  }

  const [upcoming, setUpcoming] = useState<Event[]>([])
  const [past, setPast] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [seasonId, setSeasonId] = useState('')
  const [sportFilter, setSportFilter] = useState<Sport | ''>('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase
        .from('events')
        .select('*, season:seasons(id, name)')
        .in('status', ['registration', 'in_progress'])
        .order('created_at', { ascending: false }),
      supabase
        .from('events')
        .select('*, season:seasons(id, name)')
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false }),
    ]).then(([up, pa]) => {
      if (cancelled) return
      setUpcoming((up.data ?? []) as Event[])
      setPast((pa.data ?? []) as Event[])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const seasonOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of past) {
      const sid = e.season_id
      const name = (e as Event & { season?: { name?: string } }).season?.name?.trim()
      if (sid && name) seen.set(sid, name)
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }))
  }, [past])

  const pastFiltered = useMemo(() => {
    let list = [...past]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const name = e.name.toLowerCase()
        const desc = (e.description ?? '').toLowerCase()
        const cat = (e.category ?? '').toLowerCase()
        return name.includes(q) || desc.includes(q) || cat.includes(q)
      })
    }
    if (seasonId) list = list.filter((e) => e.season_id === seasonId)
    if (sportFilter) list = list.filter((e) => e.sport === sportFilter)
    return list
  }, [past, search, seasonId, sportFilter])

  const renderEventCard = (e: Event) => {
    const seasonName = (e as Event & { season?: { name?: string } }).season?.name
    return (
      <Card
        key={e.id}
        className="cursor-pointer hover:border-white/20 transition-colors"
        onClick={() => navigate(`/guest/events/${e.id}`)}
      >
        <div className="flex items-start justify-between mb-3">
          <span className="text-2xl">{getSportIcon(e.sport as Sport)}</span>
          <Badge
            variant={
              e.status === 'in_progress'
                ? 'danger'
                : e.status === 'completed'
                  ? 'success'
                  : e.status === 'cancelled'
                    ? 'default'
                    : 'info'
            }
            size="sm"
          >
            {eventPublicLifecycleLabel(e.status)}
          </Badge>
        </div>
        <h3 className="font-bold">{e.name}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1 capitalize">
          {getSportLabel(e.sport as Sport)} · {formatEnumLabel(e.format ?? '')}
        </p>
        {e.description && <p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2">{e.description}</p>}
        {seasonName && <p className="text-xs text-[var(--text-muted)] mt-1">{seasonName}</p>}
      </Card>
    )
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
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-[var(--text-muted)] text-sm">
            {view === 'upcoming'
              ? `${upcoming.length} upcoming or live`
              : `${pastFiltered.length} shown${past.length !== pastFiltered.length ? ` of ${past.length}` : ''} in archive`}
          </p>
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'upcoming', label: 'Upcoming & live' },
          { id: 'past', label: 'Past results' },
        ]}
        active={view}
        onChange={(id) => setView(id as EventsView)}
      />

      {view === 'past' && (
        <div className="space-y-3">
          <Input
            icon={<Search className="w-4 h-4" />}
            placeholder="Search by name, description, or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search past events"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Season"
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              options={[{ value: '', label: 'All seasons' }, ...seasonOptions]}
            />
            <Select
              label="Sport"
              value={sportFilter}
              onChange={(e) => setSportFilter((e.target.value || '') as Sport | '')}
              options={[
                { value: '', label: 'All sports' },
                { value: 'basketball', label: 'Basketball' },
                { value: 'volleyball', label: 'Volleyball' },
                { value: 'table-tennis', label: 'Table Tennis' },
              ]}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : view === 'upcoming' ? (
        upcoming.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No upcoming or live events"
            description="Try Past results for brackets and scores from finished events."
            action={
              <Button variant="secondary" onClick={() => setView('past')}>
                Past results
              </Button>
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{upcoming.map(renderEventCard)}</div>
        )
      ) : pastFiltered.length === 0 ? (
        <EmptyState
          icon="🏆"
          title={past.length === 0 ? 'No archived events yet' : 'No matches'}
          description={
            past.length === 0
              ? 'Finished and cancelled events appear here for everyone to browse.'
              : 'Adjust search or filters, or clear filters to see all archived events.'
          }
          action={
            past.length > 0 && (search || seasonId || sportFilter) ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setSeasonId('')
                  setSportFilter('')
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{pastFiltered.map(renderEventCard)}</div>
      )}
    </div>
  )
}
