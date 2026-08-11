import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, ArrowLeft } from 'lucide-react'
import { Button, Card, Badge, TabBar, EmptyState, Skeleton, Alert } from '../../components/ui'
import { CreateEventModal } from '../../components/organizer/CreateEventModal'
import api from '../../lib/api'
import { useOrganizerSportScope } from '../../hooks/useOrganizerSportScope'
import type { Event } from '../../types'
import {
  getSportIcon,
  getSportLabel,
  formatEnumLabel,
  organizerEventStatusLabel,
} from '../../lib/utils'

const STATUS_VARIANTS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  registration: 'info',
  in_progress: 'danger',
  completed: 'success',
  cancelled: 'default',
}

export default function OrganizerEvents() {
  const navigate = useNavigate()
  const { canConfigureSport, sportOptionsForForms, assignedSports, hasFullSportAccess } =
    useOrganizerSportScope()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [tab, setTab] = useState('active')
  const fetchGeneration = useRef(0)

  const fetchEvents = (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    const gen = ++fetchGeneration.current
    if (!silent) {
      setLoadError(null)
      setLoading(true)
    }
    api
      .get<Event[]>('/events')
      .then((r) => {
        if (gen !== fetchGeneration.current) return
        setEvents(Array.isArray(r.data) ? r.data : [])
        if (!silent) setLoadError(null)
      })
      .catch((err: unknown) => {
        if (gen !== fetchGeneration.current) return
        if (!silent) setEvents([])
        let msg =
          'Could not load events. Check that the API server is running (e.g. pnpm dev) and try again.'
        if (err && typeof err === 'object') {
          const ax = err as { response?: { data?: { error?: string } }; message?: string }
          const apiErr = ax.response?.data?.error
          if (typeof apiErr === 'string' && apiErr.trim()) msg = apiErr
          else if (typeof ax.message === 'string' && ax.message.trim()) msg = ax.message
        }
        if (!silent) setLoadError(msg)
        else console.warn('[organizer/events] Silent refresh failed:', msg)
      })
      .finally(() => {
        if (gen !== fetchGeneration.current) return
        if (!silent) setLoading(false)
      })
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const canCreateEvents = sportOptionsForForms.length > 0

  const filtered = events.filter((e) => {
    if (tab === 'active') return ['in_progress', 'registration', 'draft'].includes(e.status)
    if (tab === 'completed') return e.status === 'completed'
    if (tab === 'cancelled') return e.status === 'cancelled'
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/organizer')}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Events</h1>
            <p className="text-[var(--text-muted)] text-sm">
              {loading ? 'Loading events…' : `${events.length} total events`}
              {!hasFullSportAccess && assignedSports.length > 0 ? (
                <span className="block mt-1 text-xs">
                  You can edit events for{' '}
                  {assignedSports.map((s) => getSportLabel(s as any)).join(', ')} only. Other sports
                  are view-only.
                </span>
              ) : null}
            </p>
          </div>
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreate(true)}
            disabled={!canCreateEvents}
          >
            New Event
          </Button>
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'active', label: 'Active' },
          { id: 'completed', label: 'Completed' },
          { id: 'cancelled', label: 'Cancelled' },
          { id: 'all', label: 'All' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loadError && (
        <Alert
          type="danger"
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => fetchEvents()}>
            Retry
          </Button>
        </Alert>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : filtered.length === 0 && !loadError ? (
        events.length > 0 ? (
          <EmptyState
            icon="🏆"
            title="No events in this tab"
            description="Try Active, Completed, Cancelled, or All — your events may be under another filter."
          />
        ) : (
          <EmptyState
            icon="🏆"
            title="No events found"
            description="Create your first event to get started"
            action={
              <Button onClick={() => setShowCreate(true)} disabled={!canCreateEvents}>
                Create Event
              </Button>
            }
          />
        )
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e) => (
            <Card
              key={e.id}
              className="cursor-pointer hover:border-[var(--accent-default)]/40 transition-colors"
              onClick={() => navigate(`/organizer/events/${e.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{getSportIcon(e.sport as any)}</span>
                <Badge variant={STATUS_VARIANTS[e.status]} size="sm">
                  {organizerEventStatusLabel(e.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-bold">{e.name}</h3>
                {!canConfigureSport(e.sport) ? (
                  <Badge size="sm" variant="default">
                    View only
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-muted)] capitalize">
                {formatEnumLabel(e.format)} · {getSportLabel(e.sport as any)}
              </p>
              {e.category && <p className="text-xs text-[var(--text-muted)] mt-1">{e.category}</p>}
            </Card>
          ))}
        </div>
      ) : null}

      <CreateEventModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => fetchEvents({ silent: true })}
      />
    </div>
  )
}
