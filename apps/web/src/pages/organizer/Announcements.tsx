import React, { useEffect, useState } from 'react'
import { Plus, Bell, AlertTriangle, Calendar, Info, Trash2, Pencil } from 'lucide-react'
import {
  Button,
  Card,
  Modal,
  Input,
  Textarea,
  Select,
  Badge,
  Alert,
  EmptyState,
} from '../../components/ui'
import api from '../../lib/api'
import type { Announcement } from '../../types'
import { formatDateTime, getSportLabel } from '../../lib/utils'

const TYPE_ICONS: Record<string, any> = {
  emergency: AlertTriangle,
  reschedule: Calendar,
  reminder: Bell,
  system: Info,
}

const TYPE_COLORS: Record<string, { bg: string; icon: string }> = {
  emergency: { bg: 'bg-[var(--danger)]/15', icon: 'text-[var(--danger)]' },
  reschedule: { bg: 'bg-[var(--warning)]/15', icon: 'text-[var(--warning)]' },
  reminder: { bg: 'bg-[var(--surface-elevated)]', icon: 'text-[var(--text-muted)]' },
  system: { bg: 'bg-[var(--surface-elevated)]', icon: 'text-[var(--text-muted)]' },
}

const TYPE_BADGE_VARIANTS: Record<string, string> = {
  emergency: 'danger',
  reschedule: 'warning',
  reminder: 'default',
  system: 'default',
}

const SPORT_OPTIONS = [
  { value: 'basketball', label: '🏀 Basketball' },
  { value: 'volleyball', label: '🏐 Volleyball' },
  { value: 'table-tennis', label: '🏓 Table Tennis' },
]

const MS_DAY = 86_400_000

function formatDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function expiresPresetFromNow(days: number): string {
  return formatDatetimeLocalValue(new Date(Date.now() + days * MS_DAY))
}

/** Reverse of formatDatetimeLocalValue — DB gives ISO (UTC); the picker needs local `YYYY-MM-DDTHH:mm`. */
function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatDatetimeLocalValue(d)
}

const EMPTY_FORM = {
  type: 'reminder',
  title: '',
  body: '',
  audience_type: 'all',
  audience_id: '',
  audience_sport: 'basketball',
  is_public: false,
  display_mode: 'notification_only' as Announcement['display_mode'],
  new_scheduled_at: '',
  new_venue: '',
  expires_at: '',
}

interface EventOption {
  id: string
  name: string
  sport: string
}
interface TeamOption {
  id: string
  name: string
  sport: string
}

export default function OrganizerAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteTitle, setDeleteTitle] = useState('')
  const [deleting, setDeleting] = useState(false)
  /** Non-null while editing an existing announcement; null means the modal is creating a new one. */
  const [editingId, setEditingId] = useState<string | null>(null)

  // Audience target option lists
  const [events, setEvents] = useState<EventOption[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])

  const [form, setForm] = useState(EMPTY_FORM)

  const fetchAnnouncements = () =>
    api.get('/announcements').then((r) => {
      setAnnouncements(r.data)
      setLoading(false)
    })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  // Load event / team options lazily when the modal opens
  useEffect(() => {
    if (!showCreate) return
    api
      .get('/events')
      .then((r) => setEvents(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
    api
      .get('/teams')
      .then((r) => setTeams(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
  }, [showCreate])

  const openCreate = () => {
    setError('')
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowCreate(true)
  }

  const openEdit = (a: Announcement) => {
    setError('')
    setEditingId(a.id)
    setForm({
      type: a.type,
      title: a.title,
      body: a.body,
      audience_type: a.audience_type,
      audience_id: a.audience_id ?? '',
      audience_sport: a.audience_sport ?? 'basketball',
      is_public: a.is_public,
      display_mode: a.display_mode,
      new_scheduled_at: isoToDatetimeLocalValue(a.new_scheduled_at),
      new_venue: a.new_venue ?? '',
      expires_at: isoToDatetimeLocalValue(a.expires_at),
    })
    setShowCreate(true)
  }

  const handleSubmit = async () => {
    setCreating(true)
    setError('')
    try {
      const payload = {
        type: form.type,
        title: form.title.trim(),
        body: form.body.trim(),
        audience_type: form.audience_type,
        audience_id:
          form.audience_type === 'event' || form.audience_type === 'team'
            ? form.audience_id || undefined
            : undefined,
        audience_sport:
          form.audience_type === 'sport' ? form.audience_sport || undefined : undefined,
        is_public: form.is_public,
        display_mode: form.display_mode,
        new_scheduled_at: form.new_scheduled_at.trim() || undefined,
        new_venue: form.new_venue.trim() || undefined,
        expires_at: form.expires_at.trim() || undefined,
      }
      if (editingId) {
        await api.patch(`/announcements/${editingId}`, payload)
      } else {
        await api.post('/announcements', payload)
      }
      setShowCreate(false)
      setEditingId(null)
      fetchAnnouncements()
    } catch (e: unknown) {
      const msg =
        typeof (e as { response?: { data?: { error?: string } } }).response?.data?.error ===
        'string'
          ? (e as { response: { data: { error: string } } }).response.data.error
          : editingId
            ? 'Update failed'
            : 'Create failed'
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirmId) return
    setDeleting(true)
    try {
      await api.delete(`/announcements/${deleteConfirmId}`)
      setDeleteConfirmId(null)
      fetchAnnouncements()
    } catch {
      /* keep modal open */
    } finally {
      setDeleting(false)
    }
  }

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }))

  // Audience label helper for the list view
  const audienceLabel = (a: Announcement): string => {
    if (a.audience_type === 'all') return 'All Athletes'
    if (a.audience_type === 'sport')
      return `${getSportLabel((a.audience_sport as any) ?? 'basketball')} athletes`
    if (a.audience_type === 'event') return 'Event participants'
    if (a.audience_type === 'team') return 'Team members'
    return a.audience_type
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-[var(--text-muted)] text-sm">
            Broadcast messages to athletes and the public
          </p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
          New Announcement
        </Button>
      </div>

      {loading ? null : announcements.length === 0 ? (
        <EmptyState
          icon="📢"
          title="No announcements yet"
          description="Create your first announcement"
          action={<Button onClick={openCreate}>Create Announcement</Button>}
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const Icon = TYPE_ICONS[a.type] ?? Bell
            const colors = TYPE_COLORS[a.type] ?? TYPE_COLORS.system
            return (
              <Card key={a.id} className="flex gap-4">
                <div className={`p-2 rounded-lg flex-shrink-0 ${colors.bg}`}>
                  <Icon className={`w-5 h-5 ${colors.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{a.title}</span>
                    <Badge variant={TYPE_BADGE_VARIANTS[a.type] as any} size="sm">
                      {a.type}
                    </Badge>
                    {a.display_mode === 'banner' && (
                      <Badge variant="warning" size="sm">
                        scrolling banner
                      </Badge>
                    )}
                    {a.display_mode === 'hero_slider' && (
                      <Badge variant="info" size="sm">
                        hero slider
                      </Badge>
                    )}
                    {a.is_public && (
                      <Badge variant="info" size="sm">
                        public
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] line-clamp-2">{a.body}</p>
                  {a.new_scheduled_at && (
                    <p className="text-xs text-[var(--warning)] mt-1">
                      New time: {formatDateTime(a.new_scheduled_at)}
                      {a.new_venue ? ` · ${a.new_venue}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatDateTime(a.published_at)} · {audienceLabel(a)}
                  </p>
                </div>
                <div className="flex items-start gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    aria-label="Edit announcement"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTitle(a.title)
                      setDeleteConfirmId(a.id)
                    }}
                    className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                    aria-label="Delete announcement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={deleteConfirmId !== null}
        onClose={() => {
          if (!deleting) setDeleteConfirmId(null)
        }}
        title="Delete announcement?"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="warning">
            This removes "{deleteTitle}" for everyone (notifications, banners, and hero slider). You
            cannot undo this.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirmId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => void handleDeleteConfirmed()}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false)
          setEditingId(null)
          setError('')
        }}
        title={editingId ? 'Edit Announcement' : 'Create Announcement'}
        size="lg"
      >
        {error && (
          <Alert type="danger" className="mb-4">
            {error}
          </Alert>
        )}
        <div className="space-y-4">
          {/* Type — now the single classification field (urgency is auto-derived) */}
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
            options={[
              { value: 'emergency', label: '🚨 Emergency — critical alert' },
              { value: 'reschedule', label: '📅 Reschedule — high priority' },
              { value: 'reminder', label: '🔔 Reminder — normal priority' },
              { value: 'system', label: 'ℹ️ System — low priority' },
            ]}
          />

          {form.type === 'reschedule' && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="New date and time"
                type="datetime-local"
                value={form.new_scheduled_at}
                onChange={(e) => update('new_scheduled_at', e.target.value)}
              />
              <Input
                label="New venue"
                value={form.new_venue}
                onChange={(e) => update('new_venue', e.target.value)}
                placeholder="Court 2, Gym B..."
              />
            </div>
          )}

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Match postponed"
          />
          <Textarea
            label="Message Body"
            value={form.body}
            onChange={(e) => update('body', e.target.value)}
            placeholder="Due to weather conditions..."
            rows={3}
          />

          {/* Audience targeting */}
          <div className="space-y-3">
            <Select
              label="Audience"
              value={form.audience_type}
              onChange={(e) => update('audience_type', e.target.value)}
              options={[
                { value: 'all', label: 'All Athletes' },
                { value: 'sport', label: 'By Sport' },
                { value: 'event', label: 'By Event' },
                { value: 'team', label: 'By Team' },
              ]}
            />

            {form.audience_type === 'sport' && (
              <Select
                label="Sport"
                value={form.audience_sport}
                onChange={(e) => update('audience_sport', e.target.value)}
                options={SPORT_OPTIONS}
              />
            )}

            {form.audience_type === 'event' && (
              <Select
                label="Event"
                value={form.audience_id}
                onChange={(e) => update('audience_id', e.target.value)}
                options={[
                  { value: '', label: events.length ? 'Select event…' : 'Loading events…' },
                  ...events.map((ev) => ({
                    value: ev.id,
                    label: `${ev.name} (${getSportLabel(ev.sport as any)})`,
                  })),
                ]}
              />
            )}

            {form.audience_type === 'team' && (
              <Select
                label="Team"
                value={form.audience_id}
                onChange={(e) => update('audience_id', e.target.value)}
                options={[
                  { value: '', label: teams.length ? 'Select team…' : 'Loading teams…' },
                  ...teams.map((t) => ({
                    value: t.id,
                    label: `${t.name} (${getSportLabel(t.sport as any)})`,
                  })),
                ]}
              />
            )}
          </div>

          {/* Expiry */}
          <div className="space-y-1">
            <Input
              label="Expires"
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => update('expires_at', e.target.value)}
              hint="Leave empty for permanent"
            />
            <div className="flex flex-wrap gap-2">
              {[
                { label: '1 day', days: 1 },
                { label: '3 days', days: 3 },
                { label: '1 week', days: 7 },
              ].map(({ label, days }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => update('expires_at', expiresPresetFromNow(days))}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-default)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => update('expires_at', '')}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Display type */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--text-muted)]">Display type</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { value: 'notification_only', label: '🔔 Notification only' },
                { value: 'banner', label: '📢 Scrolling banner' },
                { value: 'hero_slider', label: '✨ Hero slider' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('display_mode', value)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    form.display_mode === value
                      ? 'bg-[var(--school-primary)] text-[var(--school-secondary)] border-transparent'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => update('is_public', e.target.checked)}
              className="accent-[#0066FF]"
            />
            <span className="text-sm">Visible to guests (public)</span>
          </label>

          <Button className="w-full" loading={creating} onClick={handleSubmit}>
            {editingId ? 'Save Changes' : 'Publish Announcement'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
