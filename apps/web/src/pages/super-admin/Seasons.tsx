import React, { useEffect, useState } from 'react'
import { Plus, Play, Check, Archive, Trash2, Pencil } from 'lucide-react'
import { Button, Card, Modal, Input, Badge, Alert, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import type { Season, Sport } from '../../types'
import { formatDate, formatEnumLabel, getSportLabel } from '../../lib/utils'
import { validateSeasonDates, todayManila } from '../../lib/validation/seasonDates'
import { fetchActiveSportsFromConfig } from '../../hooks/useOrganizerSportScope'

const STATUS_BADGE: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  active: 'success',
  completed: 'info',
  archived: 'default',
}

type StaffOption = { organizer_id: string; full_name: string; role: string }

/** Sport checkboxes with a "Select all" toggle — the professor's diagram drew
 *  this explicitly next to the per-season sport list. */
function SportCheckboxes({
  options,
  selected,
  onChange,
  dataTour,
}: {
  options: Sport[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Only the Create-season call site sets this — shared with Edit, so a
   *  bare `data-tour` here would match twice in the DOM. */
  dataTour?: string
}) {
  const allSelected = options.length > 0 && options.every((s) => selected.includes(s))
  return (
    <div data-tour={dataTour}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-[var(--text-secondary)]">Sports</label>
        <button
          type="button"
          className="text-xs text-[#0066FF] hover:underline"
          onClick={() => onChange(allSelected ? [] : options)}
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((s) => (
          <label
            key={s}
            className="flex items-center gap-2 text-sm rounded-lg border border-[var(--border-subtle)] px-3 py-2 cursor-pointer"
          >
            <input
              type="checkbox"
              className="size-4 rounded border-[var(--border-subtle)] accent-[#0066FF]"
              checked={selected.includes(s)}
              onChange={() =>
                onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s])
              }
            />
            {getSportLabel(s)}
          </label>
        ))}
      </div>
    </div>
  )
}

/** Which Organizers/Coaches are in charge of this season — the professor's
 *  diagram put this on the Admin side, "before simula ng season". */
function StaffCheckboxes({
  options,
  selected,
  onChange,
  dataTour,
}: {
  options: StaffOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Only the Create-season call site sets this — shared with Edit, so a
   *  bare `data-tour` here would match twice in the DOM. */
  dataTour?: string
}) {
  if (options.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">No staff accounts exist yet.</p>
  }
  return (
    <div data-tour={dataTour}>
      <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">
        Staff in charge
      </label>
      <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-2">
        {options.map((o) => (
          <label
            key={o.organizer_id}
            className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-[var(--surface-elevated)] cursor-pointer"
          >
            <input
              type="checkbox"
              className="size-4 rounded border-[var(--border-subtle)] accent-[#0066FF]"
              checked={selected.includes(o.organizer_id)}
              onChange={() =>
                onChange(
                  selected.includes(o.organizer_id)
                    ? selected.filter((x) => x !== o.organizer_id)
                    : [...selected, o.organizer_id],
                )
              }
            />
            <span className="flex-1">{o.full_name}</span>
            <Badge size="sm" variant="default">
              {o.role}
            </Badge>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function SuperAdminSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [sportOptions, setSportOptions] = useState<Sport[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    sports: [] as string[],
    staff_ids: [] as string[],
  })
  const [error, setError] = useState('')
  const [editSeason, setEditSeason] = useState<Season | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    sports: [] as string[],
    staff_ids: [] as string[],
  })
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')
  const [transitionConfirm, setTransitionConfirm] = useState<{
    id: string
    name: string
    nextStatus: string
    unfinishedMatches?: number
  } | null>(null)
  const [transitionBusy, setTransitionBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetch = () =>
    api
      .get<Season[]>('/admin/seasons')
      .then(({ data }) => {
        setSeasons(data ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))

  useEffect(() => {
    fetch()
    fetchActiveSportsFromConfig().then(setSportOptions)
    api
      .get<{ id: string; profile?: { full_name?: string; role?: string } }[]>('/admin/organizers')
      .then(({ data }) => {
        setStaffOptions(
          (data ?? []).map((o) => ({
            organizer_id: o.id,
            full_name: o.profile?.full_name ?? 'Staff',
            role: o.profile?.role ?? '',
          })),
        )
      })
      .catch(() => setStaffOptions([]))
  }, [])

  const handleCreate = async () => {
    setError('')
    const check = validateSeasonDates(form, { mode: 'create' })
    if (!check.ok) {
      setError(check.error)
      return
    }
    if (form.sports.length === 0) {
      setError('Select at least one sport.')
      return
    }
    setCreating(true)
    try {
      // Omit staff_ids entirely when nothing is checked, rather than sending
      // `[]` — the server's "default to every current organizer" fallback
      // only fires on a genuinely absent field (`??`), not an empty array,
      // so sending `[]` would silently assign nobody instead of everyone.
      const { staff_ids, ...rest } = form
      const payload = staff_ids.length > 0 ? form : rest
      await api.post('/admin/seasons', payload)
      setShowCreate(false)
      setForm({ name: '', start_date: '', end_date: '', sports: [], staff_ids: [] })
      fetch()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (s: Season) => {
    setEditError('')
    setEditSeason(s)
    setEditForm({
      name: s.name,
      start_date: s.start_date ?? '',
      end_date: s.end_date ?? '',
      sports: s.sports ?? [],
      staff_ids: (s.staff ?? []).map((st) => st.organizer_id),
    })
  }

  const handleEditSave = async () => {
    if (!editSeason) return
    setEditError('')
    const check = validateSeasonDates(editForm, {
      mode: 'edit',
      storedStartDate: editSeason.start_date,
    })
    if (!check.ok) {
      setEditError(check.error)
      return
    }
    if (editForm.sports.length === 0) {
      setEditError('A season must carry at least one sport.')
      return
    }
    setEditing(true)
    try {
      await api.patch(`/admin/seasons/${editSeason.id}`, editForm)
      setEditSeason(null)
      fetch()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setEditError(msg ?? 'Failed')
    } finally {
      setEditing(false)
    }
  }

  const openCompleteConfirm = async (id: string, name: string) => {
    // Check for unfinished matches before showing the confirm dialog
    try {
      const res = await api.get<{ count: number }>(`/admin/seasons/${id}/unfinished-matches`)
      setTransitionConfirm({ id, name, nextStatus: 'completed', unfinishedMatches: res.data.count })
    } catch {
      setTransitionConfirm({ id, name, nextStatus: 'completed', unfinishedMatches: 0 })
    }
  }

  const applyTransition = async () => {
    if (!transitionConfirm) return
    setTransitionBusy(true)
    try {
      await api.patch(`/admin/seasons/${transitionConfirm.id}/status`, {
        status: transitionConfirm.nextStatus,
      })
      setTransitionConfirm(null)
      fetch()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not update season')
      setTransitionConfirm(null)
    } finally {
      setTransitionBusy(false)
    }
  }

  const applyDelete = async () => {
    if (!deleteConfirm) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.delete(`/admin/seasons/${deleteConfirm.id}`)
      setDeleteConfirm(null)
      fetch()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setDeleteError(msg ?? 'Could not delete season')
    } finally {
      setDeleteBusy(false)
    }
  }

  const transitionDescription = (next: string) => {
    if (next === 'active')
      return 'This sets the season to active. Depending on your setup, other seasons may be adjusted automatically. Continue?'
    if (next === 'completed')
      return 'Mark this season as completed? This action closes the season — events and standings will be locked.'
    if (next === 'archived')
      return 'Archive this season? Historical records remain; the season leaves the active lifecycle.'
    return 'Apply this change?'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Seasons</h1>
          <p className="text-[var(--text-muted)] text-sm">Manage the sports season lifecycle</p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowCreate(true)}
          data-tour="seasons-new"
        >
          New Season
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : seasons.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)]">No seasons yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {seasons.map((s) => (
            <Card key={s.id} className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatDate(s.start_date)} — {formatDate(s.end_date)}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(s.sports ?? []).map((sport) => (
                    <Badge key={sport} size="sm" variant="default">
                      {getSportLabel(sport as Sport)}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {(s.staff ?? []).length === 0
                    ? 'No staff assigned yet'
                    : `${(s.staff ?? []).length} staff assigned`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_BADGE[s.status]}>{formatEnumLabel(s.status)}</Badge>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="w-3 h-3" />}
                    onClick={() => openEdit(s)}
                  >
                    Edit
                  </Button>
                  {s.status === 'draft' && (
                    <Button
                      size="sm"
                      icon={<Play className="w-3 h-3" />}
                      onClick={() =>
                        setTransitionConfirm({ id: s.id, name: s.name, nextStatus: 'active' })
                      }
                    >
                      Activate
                    </Button>
                  )}
                  {s.status === 'active' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Check className="w-3 h-3" />}
                      onClick={() => void openCompleteConfirm(s.id, s.name)}
                    >
                      Complete
                    </Button>
                  )}
                  {s.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Archive className="w-3 h-3" />}
                      onClick={() =>
                        setTransitionConfirm({ id: s.id, name: s.name, nextStatus: 'archived' })
                      }
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="w-3 h-3" />}
                    onClick={() => {
                      setDeleteError('')
                      setDeleteConfirm({ id: s.id, name: s.name })
                    }}
                    className="text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={transitionConfirm !== null}
        onClose={() => {
          if (!transitionBusy) setTransitionConfirm(null)
        }}
        title="Confirm season change"
        size="md"
      >
        {transitionConfirm && (
          <div className="space-y-4">
            {transitionConfirm.nextStatus === 'completed' &&
              (transitionConfirm.unfinishedMatches ?? 0) > 0 && (
                <Alert type="danger">
                  <span className="font-semibold">
                    ⚠ {transitionConfirm.unfinishedMatches} unfinished{' '}
                    {transitionConfirm.unfinishedMatches === 1 ? 'match' : 'matches'}
                  </span>
                  <span className="block mt-1 text-sm">
                    There are still scheduled or live matches in this season. Completing it now will
                    leave those matches unresolved. Are you sure you want to continue?
                  </span>
                </Alert>
              )}
            <Alert type="warning">
              <span className="font-medium">{transitionConfirm.name}</span>
              <span className="block mt-2 text-sm">
                {transitionDescription(transitionConfirm.nextStatus)}
              </span>
            </Alert>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setTransitionConfirm(null)}
                disabled={transitionBusy}
              >
                Cancel
              </Button>
              <Button loading={transitionBusy} onClick={() => void applyTransition()}>
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deleteConfirm !== null}
        onClose={() => {
          if (!deleteBusy) {
            setDeleteConfirm(null)
            setDeleteError('')
          }
        }}
        title="Delete season"
        size="md"
      >
        {deleteConfirm && (
          <div className="space-y-4">
            {deleteError && <Alert type="danger">{deleteError}</Alert>}
            <Alert type="danger">
              <span className="font-semibold">Delete "{deleteConfirm.name}"?</span>
              <span className="block mt-1 text-sm">
                This will permanently delete the season and all associated events and brackets. This
                cannot be undone.
              </span>
            </Alert>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteConfirm(null)
                  setDeleteError('')
                }}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                loading={deleteBusy}
                onClick={() => void applyDelete()}
                className="bg-[var(--danger)] hover:bg-[var(--danger)]/90 text-white border-[var(--danger)]"
              >
                Delete Season
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Season">
        {error && (
          <Alert type="danger" className="mb-4">
            {error}
          </Alert>
        )}
        <div className="space-y-4">
          <Input
            label="Season Name"
            placeholder="AY 2026-2027"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              min={todayManila()}
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
            />
            <Input
              label="End Date"
              type="date"
              min={form.start_date || todayManila()}
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          <SportCheckboxes
            options={sportOptions}
            selected={form.sports}
            onChange={(sports) => setForm((f) => ({ ...f, sports }))}
            dataTour="seasons-sports"
          />
          <StaffCheckboxes
            options={staffOptions}
            selected={form.staff_ids}
            onChange={(staff_ids) => setForm((f) => ({ ...f, staff_ids }))}
            dataTour="seasons-staff"
          />
          <p className="text-xs text-[var(--text-muted)]">
            Leave staff unselected to assign every current Organizer/Coach by default.
          </p>
          <Button
            className="w-full"
            loading={creating}
            onClick={handleCreate}
            data-tour="seasons-create-submit"
          >
            Create Season
          </Button>
        </div>
      </Modal>

      <Modal open={editSeason !== null} onClose={() => setEditSeason(null)} title="Edit Season">
        {editError && (
          <Alert type="danger" className="mb-4">
            {editError}
          </Alert>
        )}
        {editSeason && (
          <div className="space-y-4">
            <Input
              label="Season Name"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                // Omit `min` once the season has already started — a live
                // season's historical start date must stay re-selectable,
                // only future-dated seasons are pinned to "today or later".
                min={
                  editSeason.start_date && editSeason.start_date < todayManila()
                    ? undefined
                    : todayManila()
                }
                value={editForm.start_date}
                onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))}
              />
              <Input
                label="End Date"
                type="date"
                min={editForm.start_date || undefined}
                value={editForm.end_date}
                onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
            <SportCheckboxes
              options={sportOptions}
              selected={editForm.sports}
              onChange={(sports) => setEditForm((f) => ({ ...f, sports }))}
            />
            <StaffCheckboxes
              options={staffOptions}
              selected={editForm.staff_ids}
              onChange={(staff_ids) => setEditForm((f) => ({ ...f, staff_ids }))}
            />
            <Button className="w-full" loading={editing} onClick={handleEditSave}>
              Save Changes
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
