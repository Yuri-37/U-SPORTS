import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Modal, Input, Select, Textarea } from '../ui'
import api from '../../lib/api'
import { fetchSeasonsForEventForms } from '../../lib/seasonsLookup'
import { useOrganizerSportScope } from '../../hooks/useOrganizerSportScope'
import type { Season } from '../../types'

export const EVENT_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  basketball: [
    { value: "Men's Open", label: "Men's Open" },
    { value: "Women's Open", label: "Women's Open" },
    { value: "Men's Varsity", label: "Men's Varsity" },
    { value: "Women's Varsity", label: "Women's Varsity" },
    { value: 'Mixed', label: 'Mixed' },
  ],
  volleyball: [
    { value: "Men's Open", label: "Men's Open" },
    { value: "Women's Open", label: "Women's Open" },
    { value: "Men's Varsity", label: "Men's Varsity" },
    { value: "Women's Varsity", label: "Women's Varsity" },
    { value: 'Mixed', label: 'Mixed' },
  ],
  'table-tennis': [
    { value: "Men's Singles", label: "Men's Singles" },
    { value: "Women's Singles", label: "Women's Singles" },
    { value: "Men's Doubles", label: "Men's Doubles" },
    { value: "Women's Doubles", label: "Women's Doubles" },
    { value: 'Mixed Doubles', label: 'Mixed Doubles' },
  ],
}

const defaultForm = () => ({
  name: '',
  sport: 'basketball',
  season_id: '',
  format: 'single_elim',
  category: '',
  description: '',
  table_tennis_format: 'singles' as 'singles' | 'doubles',
  // Match length. Basketball has no best-of concept (4 quarters + OT), so this
  // is left null for it. Null elsewhere means "use the sport default" (5).
  best_of: 5 as 1 | 3 | 5 | 7,
})

export type CreateEventModalProps = {
  open: boolean
  onClose: () => void
  /** Runs after a successful create, before navigating to the new event. */
  onCreated?: () => void
}

export function CreateEventModal({ open, onClose, onCreated }: CreateEventModalProps) {
  const navigate = useNavigate()
  const { sportOptionsForForms } = useOrganizerSportScope()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [form, setForm] = useState(defaultForm)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const canCreateEvents = sportOptionsForForms.length > 0

  useEffect(() => {
    if (!open) {
      setForm(defaultForm())
      setError('')
      setCreating(false)
      return
    }
    fetchSeasonsForEventForms()
      .then(setSeasons)
      .catch(() => setSeasons([]))
  }, [open])

  useEffect(() => {
    if (!open || seasons.length !== 1 || form.season_id) return
    setForm((f) => ({ ...f, season_id: seasons[0]!.id }))
  }, [open, seasons, form.season_id])

  // Sport depends on season (a season only carries some sports), so the
  // dropdown is the organizer's own sports intersected with the CHOSEN
  // season's sports. Undefined `sports` (still loading, or a season fetched
  // outside this list) reads as "no restriction" rather than "empty".
  const selectedSeason = seasons.find((s) => s.id === form.season_id)
  const seasonSportSet = selectedSeason?.sports ? new Set(selectedSeason.sports) : null
  const sportOptionsForSeason = seasonSportSet
    ? sportOptionsForForms.filter((o) => seasonSportSet.has(o.value))
    : sportOptionsForForms

  useEffect(() => {
    if (!open || sportOptionsForSeason.length === 0) return
    setForm((f) =>
      sportOptionsForSeason.some((o) => o.value === f.sport)
        ? f
        : { ...f, sport: sportOptionsForSeason[0]!.value, category: '' },
    )
    // sportOptionsForSeason is derived fresh each render from seasons/form.season_id/
    // sportOptionsForForms — depending on those directly avoids re-running this
    // effect on every render from a new array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.season_id, seasons, sportOptionsForForms])

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('Enter an event name.')
      return
    }
    if (!form.season_id) {
      setError(
        'Select a season (draft or active). Create one under Super Admin → Seasons if missing.',
      )
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await api.post('/events', {
        ...form,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        table_tennis_format: form.sport === 'table-tennis' ? form.table_tennis_format : undefined,
        best_of:
          form.sport === 'volleyball' || form.sport === 'table-tennis' ? form.best_of : undefined,
      })
      onCreated?.()
      onClose()
      navigate(`/organizer/events/${res.data.id}`)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Create failed — verify API URL and backend is running.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Event" size="md">
      {error && (
        <div className="text-[#FF3355] text-sm mb-4 bg-[#FF3355]/10 p-3 rounded-lg">{error}</div>
      )}
      <div className="space-y-4">
        <Input
          label="Event Name"
          placeholder="Men's Basketball Tournament"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Select
          label="Season"
          value={form.season_id}
          onChange={(e) => setForm((f) => ({ ...f, season_id: e.target.value }))}
          options={[
            {
              value: '',
              label: seasons.length ? 'Select season...' : 'No seasons — Super Admin → Seasons',
            },
            ...seasons.map((s) => ({
              value: s.id,
              label: `${s.name}${s.status === 'draft' ? ' — draft' : s.status === 'active' ? ' — active' : ''}`,
            })),
          ]}
        />
        {seasons.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            Create seasons as Super Admin. Draft seasons work for testing.
          </p>
        )}
        {/* Sport depends on the season chosen above — a season only carries
            some sports, so this list narrows once a season is selected. */}
        <Select
          label="Sport"
          value={form.sport}
          onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value, category: '' }))}
          options={sportOptionsForSeason.map((o) => ({ value: o.value, label: o.label }))}
          disabled={!form.season_id}
        />
        {form.season_id && sportOptionsForSeason.length === 0 && (
          <p className="text-xs text-[var(--danger)] -mt-2">
            This season has no sports you're assigned to. Ask a Super Admin to add one under
            Seasons.
          </p>
        )}
        {form.sport === 'table-tennis' && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Table Tennis Format</p>
            <div className="flex gap-2">
              {(['singles', 'doubles'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, table_tennis_format: fmt }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.table_tennis_format === fmt ? 'bg-[var(--accent-default)] border-[var(--accent-default)] text-white' : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {fmt === 'singles' ? '🏓 Singles (1 vs 1)' : '🏓🏓 Doubles (2 vs 2)'}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Sets the active player count per side: 1 for singles, 2 for doubles.
            </p>
          </div>
        )}
        {(form.sport === 'volleyball' || form.sport === 'table-tennis') && (
          <Select
            label={`Best of (${form.sport === 'volleyball' ? 'sets' : 'games'})`}
            value={String(form.best_of)}
            onChange={(e) =>
              setForm((f) => ({ ...f, best_of: Number(e.target.value) as 1 | 3 | 5 | 7 }))
            }
            options={[1, 3, 5, 7].map((n) => ({ value: String(n), label: `Best of ${n}` }))}
          />
        )}
        <Select
          label="Format"
          value={form.format}
          onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
          options={[
            { value: 'single_elim', label: 'Single Elimination' },
            { value: 'double_elim', label: 'Double Elimination' },
            { value: 'round_robin', label: 'Round Robin' },
          ]}
        />
        {form.format === 'round_robin' && (
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            With <strong>more than 10 teams</strong>, the bracket generator creates two round-robin
            pools, then crossover semifinals and a final. Assign semifinal teams on the event page
            after pool play.
          </p>
        )}
        <Select
          label="Category (optional)"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          options={[{ value: '', label: 'No category' }, ...(EVENT_CATEGORIES[form.sport] ?? [])]}
        />
        <Textarea
          label="Description (optional)"
          placeholder="Rules, venue notes, schedule…"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Button
          className="w-full"
          loading={creating}
          disabled={!seasons.length || !canCreateEvents || sportOptionsForSeason.length === 0}
          onClick={handleCreate}
        >
          Create Event
        </Button>
      </div>
    </Modal>
  )
}
