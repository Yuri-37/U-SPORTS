import React, { useEffect, useState } from 'react'
import { Plus, ToggleLeft, ToggleRight, Mail, Lock, Pencil, Copy, Check } from 'lucide-react'
import {
  Button,
  Modal,
  Input,
  Badge,
  Table,
  Alert,
  Skeleton,
  Select,
  PasswordStrengthMeter,
} from '../../components/ui'
import api from '../../lib/api'
import type { Organizer, Profile } from '../../types'
import { getSportLabel, getSportIcon } from '../../lib/utils'
import { createOrganizerFormSchema, STAFF_ROLES, DEPARTMENTS } from '../../lib/validation/forms'

type StaffWithProfile = Organizer & { profile: Profile & { role?: string; department?: string } }
type AdminAccount = { id: string; full_name: string; email: string; created_at: string }

const SPORTS = ['basketball', 'volleyball', 'table-tennis']

function SportCheckboxes({
  role,
  sports,
  onChange,
  takenBy = {},
}: {
  role: string
  sports: string[]
  onChange: (s: string[]) => void
  /** sport -> name of the coach already holding it in the selected department. */
  takenBy?: Record<string, string>
}) {
  // Each coach handles exactly one sport/department — a radio group enforces
  // that at the input level instead of just capping a checkbox list.
  const single = role === 'Coach'
  return (
    <div>
      <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1">
        {single ? 'Assign sport' : 'Assign sports'}
      </label>
      {single && (
        <p className="text-xs text-[var(--text-muted)] mb-2">
          Each coach is assigned one sport, and each sport can have only one coach per department.
        </p>
      )}
      <div className="space-y-2">
        {SPORTS.map((s) => {
          const checked = sports.includes(s)
          // Mirrors the server-side one-coach-per-sport-per-department rule so
          // the clash is visible before submitting rather than as a 400.
          const takenByName = single && !checked ? takenBy[s] : undefined
          const disabled = Boolean(takenByName)
          return (
            <label
              key={s}
              className={`flex items-center gap-2 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type={single ? 'radio' : 'checkbox'}
                name={single ? 'coach-sport' : undefined}
                checked={checked}
                disabled={disabled}
                onChange={(e) => {
                  if (single) onChange([s])
                  else onChange(e.target.checked ? [...sports, s] : sports.filter((x) => x !== s))
                }}
                className="accent-[#0066FF]"
              />
              <span className="text-sm">
                {getSportIcon(s as any)} {getSportLabel(s as any)}
                {takenByName && (
                  <span className="text-[var(--text-muted)]"> — coached by {takenByName}</span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

type SeasonOption = { id: string; name: string; status: string }

/** Which seasons this staff member is in charge of — the professor's diagram
 *  drew this at season-creation time, but it's equally an attribute of the
 *  staff member, so it's editable from either side of the same season_staff
 *  relationship. */
function SeasonCheckboxes({
  options,
  selected,
  onChange,
}: {
  options: SeasonOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  if (options.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">No seasons exist yet.</p>
  }
  return (
    <div>
      <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">
        Seasons in charge of
      </label>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Leave unselected to default to every current draft/active season.
      </p>
      <div className="space-y-1.5">
        {options.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="size-4 rounded border-[var(--border-subtle)] accent-[#0066FF]"
              checked={selected.includes(s.id)}
              onChange={() =>
                onChange(
                  selected.includes(s.id)
                    ? selected.filter((x) => x !== s.id)
                    : [...selected, s.id],
                )
              }
            />
            <span>
              {s.name} <span className="text-[var(--text-muted)]">— {s.status}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function SuperAdminOrganizers() {
  const [staff, setStaff] = useState<StaffWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [success, setSuccess] = useState('')

  // Super Admins
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [adminsLoading, setAdminsLoading] = useState(true)
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [addAdminName, setAddAdminName] = useState('')
  const [addAdminEmail, setAddAdminEmail] = useState('')
  const [addAdminPassword, setAddAdminPassword] = useState('')
  const [addAdminConfirmPassword, setAddAdminConfirmPassword] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)
  const [addAdminError, setAddAdminError] = useState('')

  const fetchAdmins = () => {
    api
      .get('/admin/admins')
      .then((r) => {
        setAdmins(r.data)
        setAdminsLoading(false)
      })
      .catch(() => setAdminsLoading(false))
  }
  useEffect(() => {
    fetchAdmins()
  }, [])

  const resetAddAdminForm = () => {
    setAddAdminName('')
    setAddAdminEmail('')
    setAddAdminPassword('')
    setAddAdminConfirmPassword('')
  }

  const handleAddAdmin = async () => {
    setAddingAdmin(true)
    setAddAdminError('')
    if (!addAdminName.trim()) {
      setAddAdminError('Full name is required')
      setAddingAdmin(false)
      return
    }
    if (!addAdminEmail.trim()) {
      setAddAdminError('Email is required')
      setAddingAdmin(false)
      return
    }
    if (addAdminPassword.length < 8) {
      setAddAdminError('Password must be at least 8 characters')
      setAddingAdmin(false)
      return
    }
    if (addAdminPassword !== addAdminConfirmPassword) {
      setAddAdminError('Passwords do not match')
      setAddingAdmin(false)
      return
    }
    try {
      await api.post('/admin/admins', {
        full_name: addAdminName.trim(),
        email: addAdminEmail.trim(),
        password: addAdminPassword,
      })
      setSuccess(
        `Super Admin account created for ${addAdminEmail.trim()}. Share the sign-in page and password with them securely.`,
      )
      resetAddAdminForm()
      setShowAddAdmin(false)
      fetchAdmins()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setAddAdminError(msg ?? 'Could not create admin account')
    } finally {
      setAddingAdmin(false)
    }
  }

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addConfirmPassword, setAddConfirmPassword] = useState('')
  const [addRole, setAddRole] = useState<'Organizer' | 'Coach'>('Organizer')
  const [addDepartment, setAddDepartment] = useState<string>('SBMA')
  const [addSports, setAddSports] = useState<string[]>([])
  const [addSeasonIds, setAddSeasonIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit modal
  const [editTarget, setEditTarget] = useState<StaffWithProfile | null>(null)
  const [editRole, setEditRole] = useState<'Organizer' | 'Coach'>('Organizer')
  const [editDepartment, setEditDepartment] = useState<string>('SBMA')
  const [editSports, setEditSports] = useState<string[]>([])
  const [editSeasonIds, setEditSeasonIds] = useState<string[]>([])
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')

  // Seasons, for the "in charge of" picker on both forms.
  const [seasonOptions, setSeasonOptions] = useState<SeasonOption[]>([])
  useEffect(() => {
    api
      .get<SeasonOption[]>('/admin/seasons')
      .then(({ data }) => setSeasonOptions(data ?? []))
      .catch(() => setSeasonOptions([]))
  }, [])

  // Toggle active
  const [toggleConfirm, setToggleConfirm] = useState<StaffWithProfile | null>(null)
  const [toggleBusy, setToggleBusy] = useState(false)

  // Reset password
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState<StaffWithProfile | null>(null)
  const [resetPasswordBusy, setResetPasswordBusy] = useState(false)
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    name: string
    tempPassword: string
  } | null>(null)
  const [resetPasswordCopied, setResetPasswordCopied] = useState(false)

  /**
   * Sports already claimed by a coach in `department`, as sport -> coach name.
   * `excludeId` skips the staff row being edited so their own current sports
   * don't read as conflicts against themselves.
   */
  const takenSportsFor = (department: string, excludeId?: string): Record<string, string> => {
    const taken: Record<string, string> = {}
    for (const s of staff) {
      if (s.id === excludeId) continue
      if (s.profile?.role !== 'Coach' || s.profile?.department !== department) continue
      for (const sport of s.assigned_sports ?? []) {
        taken[sport] ??= s.profile?.full_name ?? 'another coach'
      }
    }
    return taken
  }

  const fetchStaff = () => {
    api
      .get('/admin/organizers')
      .then((r) => {
        setStaff(r.data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  useEffect(() => {
    fetchStaff()
  }, [])

  const resetAddForm = () => {
    setAddEmail('')
    setAddName('')
    setAddPassword('')
    setAddConfirmPassword('')
    setAddRole('Organizer')
    setAddDepartment('SBMA')
    setAddSports([])
    setAddSeasonIds([])
  }

  const handleAddStaff = async () => {
    setAdding(true)
    setAddError('')
    const parsed = createOrganizerFormSchema.safeParse({
      full_name: addName,
      email: addEmail,
      password: addPassword,
      confirmPassword: addConfirmPassword,
      role: addRole,
      department: addRole === 'Coach' ? addDepartment : null,
      assigned_sports: addSports,
    })
    if (!parsed.success) {
      setAddError(parsed.error.issues[0]?.message ?? 'Check the form')
      setAdding(false)
      return
    }
    try {
      await api.post('/admin/organizers', {
        email: parsed.data.email,
        full_name: parsed.data.full_name,
        password: parsed.data.password,
        role: parsed.data.role,
        department: parsed.data.department,
        assigned_sports: parsed.data.assigned_sports,
        // Omit entirely when nothing is checked so the server's own default
        // (every current draft/active season) applies — sending `[]` would
        // otherwise assign this brand-new account to nothing at all.
        ...(addSeasonIds.length > 0 ? { season_ids: addSeasonIds } : {}),
      })
      setSuccess(
        `${parsed.data.role} account created for ${parsed.data.email}. Share the sign-in page and password with them securely.`,
      )
      resetAddForm()
      setShowAdd(false)
      fetchStaff()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setAddError(msg ?? 'Could not create staff account')
    } finally {
      setAdding(false)
    }
  }

  const openEdit = (o: StaffWithProfile) => {
    const role = (o.profile?.role as 'Organizer' | 'Coach') ?? 'Organizer'
    setEditTarget(o)
    setEditRole(role)
    setEditDepartment(o.profile?.department ?? 'SBMA')
    // A coach saved before the one-sport rule may still have up to 3 stored —
    // trim to the first so the radio group opens with exactly one checked.
    const sports = [...(o.assigned_sports ?? [])]
    setEditSports(role === 'Coach' ? sports.slice(0, 1) : sports)
    setEditSeasonIds((o.season_staff ?? []).map((r) => r.season_id))
    setEditError('')
  }

  const handleEditStaff = async () => {
    if (!editTarget) return
    if (editSports.length === 0) {
      setEditError('Assign at least one sport')
      return
    }
    if (editRole === 'Coach' && editSports.length !== 1) {
      setEditError('Coaches must be assigned exactly one sport')
      return
    }
    setEditBusy(true)
    setEditError('')
    try {
      await api.patch(`/admin/organizers/${editTarget.id}`, {
        role: editRole,
        department: editRole === 'Coach' ? editDepartment : null,
        assigned_sports: editSports,
        // Edit always sends the explicit set (even []) — unlike create,
        // there's no "leave it and get a default" convenience here; this is
        // an intentional set-or-unset action on an existing account.
        season_ids: editSeasonIds,
      })
      setSuccess(`${editTarget.profile?.full_name} updated successfully.`)
      setEditTarget(null)
      fetchStaff()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setEditError(msg ?? 'Could not update staff member')
    } finally {
      setEditBusy(false)
    }
  }

  const confirmToggleActive = async () => {
    if (!toggleConfirm) return
    setToggleBusy(true)
    try {
      await api.patch(`/admin/organizers/${toggleConfirm.id}/toggle`)
      setToggleConfirm(null)
      setListError('')
      fetchStaff()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setListError(msg ?? 'Could not update staff member')
      setToggleConfirm(null)
    } finally {
      setToggleBusy(false)
    }
  }

  const confirmResetPassword = async () => {
    if (!resetPasswordConfirm) return
    setResetPasswordBusy(true)
    try {
      const { data } = await api.post<{ tempPassword: string }>(
        `/admin/organizers/${resetPasswordConfirm.id}/reset-password`,
      )
      setResetPasswordResult({
        name: resetPasswordConfirm.profile?.full_name ?? 'this staff member',
        tempPassword: data.tempPassword,
      })
      setResetPasswordConfirm(null)
      setListError('')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setListError(msg ?? 'Could not reset password')
      setResetPasswordConfirm(null)
    } finally {
      setResetPasswordBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {success && (
        <Alert type="success" onDismiss={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      {listError && (
        <Alert type="danger" onDismiss={() => setListError('')}>
          {listError}
        </Alert>
      )}

      {/* Super Admins */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Super Admins</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Full platform access. Add another admin so more than one person can manage the
            deployment.
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setAddAdminError('')
            setShowAddAdmin(true)
          }}
        >
          Add Super Admin
        </Button>
      </div>

      {adminsLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'created', label: 'Added' },
          ]}
          data={admins.map((a) => ({
            name: (
              <div>
                <p className="font-medium">{a.full_name}</p>
                <p className="text-xs text-[var(--text-muted)]">{a.email}</p>
              </div>
            ),
            created: (
              <span className="text-sm text-[var(--text-muted)]">
                {new Date(a.created_at).toLocaleDateString()}
              </span>
            ),
          }))}
          emptyMessage="No super admins yet."
        />
      )}

      {/* Staff (organizers / coaches) */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl font-bold">Staff</h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Manage organizers and coaches with their sport and department assignments
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setAddError('')
            setShowAdd(true)
          }}
        >
          Add staff
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'role', label: 'Role' },
            { key: 'dept', label: 'Department' },
            { key: 'sports', label: 'Sports' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: '' },
          ]}
          data={staff.map((o) => ({
            name: (
              <div>
                <p className="font-medium">{o.profile?.full_name}</p>
                <p className="text-xs text-[var(--text-muted)]">{o.profile?.email}</p>
              </div>
            ),
            role: (
              <Badge variant={o.profile?.role === 'Coach' ? 'default' : 'info'} size="sm">
                {o.profile?.role ?? '—'}
              </Badge>
            ),
            dept: (
              <span className="text-sm text-[var(--text-muted)]">
                {o.profile?.department ?? '—'}
              </span>
            ),
            sports: (
              <div className="flex gap-1 flex-wrap">
                {(o.assigned_sports ?? []).map((s) => (
                  <Badge key={s} variant="info" size="sm">
                    {getSportIcon(s as any)} {getSportLabel(s as any)}
                  </Badge>
                ))}
                {(o.assigned_sports ?? []).length === 0 && (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                )}
              </div>
            ),
            status: (
              <Badge variant={o.is_active ? 'success' : 'default'}>
                {o.is_active ? 'Active' : 'Inactive'}
              </Badge>
            ),
            actions: (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pencil className="w-3.5 h-3.5" />}
                  onClick={() => openEdit(o)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={
                    o.is_active ? (
                      <ToggleRight className="w-4 h-4" />
                    ) : (
                      <ToggleLeft className="w-4 h-4" />
                    )
                  }
                  onClick={() => setToggleConfirm(o)}
                >
                  {o.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Lock className="w-3.5 h-3.5" />}
                  onClick={() => setResetPasswordConfirm(o)}
                >
                  Reset password
                </Button>
              </div>
            ),
          }))}
          emptyMessage="No staff yet. Add an organizer or coach to get started."
        />
      )}

      {/* Edit modal */}
      <Modal
        open={editTarget !== null}
        onClose={() => {
          if (!editBusy) setEditTarget(null)
        }}
        title="Edit staff member"
      >
        {editTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--surface-elevated)] px-4 py-3">
              <p className="font-medium text-sm">{editTarget.profile?.full_name}</p>
              <p className="text-xs text-[var(--text-muted)]">{editTarget.profile?.email}</p>
            </div>
            {editError && <Alert type="danger">{editError}</Alert>}
            <div className={editRole === 'Coach' ? 'grid grid-cols-2 gap-3' : ''}>
              <Select
                label="Role"
                value={editRole}
                onChange={(e) => {
                  const r = e.target.value as 'Organizer' | 'Coach'
                  setEditRole(r)
                  if (r === 'Coach' && editSports.length > 1) setEditSports(editSports.slice(0, 1))
                }}
                options={STAFF_ROLES.map((r) => ({ value: r, label: r }))}
              />
              {editRole === 'Coach' && (
                <Select
                  label="Department"
                  value={editDepartment}
                  onChange={(e) => {
                    const dept = e.target.value
                    setEditDepartment(dept)
                    const taken = takenSportsFor(dept, editTarget?.id)
                    setEditSports((prev) => prev.filter((s) => !taken[s]))
                  }}
                  options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                />
              )}
            </div>
            <SportCheckboxes
              role={editRole}
              sports={editSports}
              onChange={setEditSports}
              takenBy={takenSportsFor(editDepartment, editTarget?.id)}
            />
            <SeasonCheckboxes
              options={seasonOptions}
              selected={editSeasonIds}
              onChange={setEditSeasonIds}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditTarget(null)} disabled={editBusy}>
                Cancel
              </Button>
              <Button loading={editBusy} onClick={() => void handleEditStaff()}>
                Save changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Toggle active modal */}
      <Modal
        open={toggleConfirm !== null}
        onClose={() => {
          if (!toggleBusy) setToggleConfirm(null)
        }}
        title={toggleConfirm?.is_active ? 'Deactivate staff member?' : 'Activate staff member?'}
        size="md"
      >
        {toggleConfirm && (
          <div className="space-y-4">
            <Alert type={toggleConfirm.is_active ? 'warning' : 'info'}>
              {toggleConfirm.is_active ? (
                <>
                  <strong>{toggleConfirm.profile?.full_name}</strong> will be signed out on all
                  devices and blocked from the platform until activated again.
                </>
              ) : (
                <>
                  Restore access for <strong>{toggleConfirm.profile?.full_name}</strong>? They can
                  sign in again.
                </>
              )}
            </Alert>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setToggleConfirm(null)}
                disabled={toggleBusy}
              >
                Cancel
              </Button>
              <Button
                variant={toggleConfirm.is_active ? 'danger' : 'success'}
                loading={toggleBusy}
                onClick={() => void confirmToggleActive()}
              >
                {toggleConfirm.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset password confirm */}
      <Modal
        open={resetPasswordConfirm !== null}
        onClose={() => {
          if (!resetPasswordBusy) setResetPasswordConfirm(null)
        }}
        title="Reset password"
        size="md"
      >
        {resetPasswordConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Generate a new temporary password for{' '}
              <span className="font-semibold">{resetPasswordConfirm.profile?.full_name}</span>?
              Their current password stops working immediately — you'll need to relay the new one
              to them directly (there's no self-service reset yet).
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setResetPasswordConfirm(null)}
                disabled={resetPasswordBusy}
              >
                Cancel
              </Button>
              <Button loading={resetPasswordBusy} onClick={() => void confirmResetPassword()}>
                Generate new password
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset password result */}
      <Modal
        open={resetPasswordResult !== null}
        onClose={() => {
          setResetPasswordResult(null)
          setResetPasswordCopied(false)
        }}
        title="Password reset"
        size="md"
      >
        {resetPasswordResult && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              New temporary password for{' '}
              <span className="font-semibold">{resetPasswordResult.name}</span>. This is shown
              once — copy it now and relay it to them directly.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={resetPasswordResult.tempPassword} className="font-mono" />
              <Button
                variant="secondary"
                icon={
                  resetPasswordCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />
                }
                onClick={async () => {
                  await navigator.clipboard.writeText(resetPasswordResult.tempPassword)
                  setResetPasswordCopied(true)
                }}
              >
                {resetPasswordCopied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setResetPasswordResult(null)
                  setResetPasswordCopied(false)
                }}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Super Admin modal */}
      <Modal
        open={showAddAdmin}
        onClose={() => {
          setShowAddAdmin(false)
          resetAddAdminForm()
          setAddAdminError('')
        }}
        title="Add Super Admin"
      >
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Creates their login immediately with full platform access. No email is sent — share the
          password with them directly.
        </p>
        {addAdminError && (
          <Alert type="danger" className="mb-4">
            {addAdminError}
          </Alert>
        )}
        <div className="space-y-4">
          <Input
            label="Full name"
            value={addAdminName}
            onChange={(e) => setAddAdminName(e.target.value)}
            placeholder="Admin name"
          />
          <Input
            label="Email"
            type="email"
            value={addAdminEmail}
            onChange={(e) => setAddAdminEmail(e.target.value)}
            placeholder="admin@school.edu"
            icon={<Mail className="w-4 h-4" />}
          />
          <div>
            <Input
              label="Temporary password"
              type="password"
              value={addAdminPassword}
              onChange={(e) => setAddAdminPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              icon={<Lock className="w-4 h-4" />}
            />
            <PasswordStrengthMeter password={addAdminPassword} />
          </div>
          <Input
            label="Confirm password"
            type="password"
            value={addAdminConfirmPassword}
            onChange={(e) => setAddAdminConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
            icon={<Lock className="w-4 h-4" />}
          />
          <Button className="w-full" loading={addingAdmin} onClick={handleAddAdmin}>
            Create account
          </Button>
        </div>
      </Modal>

      {/* Add staff modal */}
      <Modal
        open={showAdd}
        onClose={() => {
          setShowAdd(false)
          resetAddForm()
          setAddError('')
        }}
        title="Add staff member"
      >
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Creates their login immediately. No email is sent — share the password with them directly.
        </p>
        {addError && (
          <Alert type="danger" className="mb-4">
            {addError}
          </Alert>
        )}
        <div className="space-y-4">
          <Input
            label="Full name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Staff member name"
          />
          <Input
            label="Email"
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="staff@school.edu"
            icon={<Mail className="w-4 h-4" />}
          />
          <div>
            <Input
              label="Temporary password"
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              icon={<Lock className="w-4 h-4" />}
            />
            <PasswordStrengthMeter password={addPassword} />
          </div>
          <Input
            label="Confirm password"
            type="password"
            value={addConfirmPassword}
            onChange={(e) => setAddConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
            icon={<Lock className="w-4 h-4" />}
          />
          <div className={addRole === 'Coach' ? 'grid grid-cols-2 gap-3' : ''}>
            <Select
              label="Role"
              value={addRole}
              onChange={(e) => {
                const r = e.target.value as 'Organizer' | 'Coach'
                setAddRole(r)
                if (r === 'Coach' && addSports.length > 1) setAddSports(addSports.slice(0, 1))
              }}
              options={STAFF_ROLES.map((r) => ({ value: r, label: r }))}
            />
            {addRole === 'Coach' && (
              <Select
                label="Department"
                value={addDepartment}
                onChange={(e) => {
                  const dept = e.target.value
                  setAddDepartment(dept)
                  // Sports free in the old department may be taken in the new one —
                  // drop those so a stale tick can't submit a known conflict.
                  const taken = takenSportsFor(dept)
                  setAddSports((prev) => prev.filter((s) => !taken[s]))
                }}
                options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
              />
            )}
          </div>
          <SportCheckboxes
            role={addRole}
            sports={addSports}
            onChange={setAddSports}
            takenBy={takenSportsFor(addDepartment)}
          />
          <SeasonCheckboxes
            options={seasonOptions}
            selected={addSeasonIds}
            onChange={setAddSeasonIds}
          />
          <Button className="w-full" loading={adding} onClick={handleAddStaff}>
            Create account
          </Button>
        </div>
      </Modal>
    </div>
  )
}
