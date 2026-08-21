import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw, Search, Upload, AlertCircle, Copy, Check, UserPlus } from 'lucide-react'
import { Button, Table, Badge, Modal, Alert, Input, Select } from '../../components/ui'
import api from '../../lib/api'
import type { Athlete, Sport } from '../../types'
import { getSportLabel, getSportIcon, cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useOrganizerSportScope } from '../../hooks/useOrganizerSportScope'
import { studentEmailZ } from '../../lib/validation/forms'

const DEPARTMENT_OPTIONS = [
  { value: 'SBMA', label: 'SBMA' },
  { value: 'SECA', label: 'SECA' },
  { value: 'SASE', label: 'SASE' },
  { value: 'SHS', label: 'SHS' },
] as const

type AthleteWithProfile = Athlete & {
  profile: { full_name: string; email: string }
}

type ImportPreviewRow = {
  row: number
  valid: boolean
  error?: string
  full_name?: string
  student_id?: string
  department?: string
  sport?: string
  year_level?: string
  course?: string
  email?: string
  password?: string
}

const SPORT_FILTER_OPTIONS: { value: Sport | ''; label: string }[] = [
  { value: '', label: 'All sports' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'volleyball', label: 'Volleyball' },
  { value: 'table-tennis', label: 'Table tennis' },
]

function describeApiLoadError(err: unknown): string {
  const base =
    'Make sure the API is running from the repo root: `pnpm dev` or `pnpm dev:server` (default http://localhost:3001).'
  if (err && typeof err === 'object' && 'response' in err) {
    const r = err as { response?: { status?: number; data?: { error?: string } } }
    const status = r.response?.status
    const msg = r.response?.data?.error
    if (status && msg) return `${msg} (HTTP ${status}).`
    if (status) return `Request failed with HTTP ${status}. ${base}`
  }
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: string }).code === 'ECONNABORTED'
  ) {
    return `Request timed out. ${base}`
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = String((err as { message?: string }).message ?? '')
    if (/Network Error|ECONNREFUSED|Failed to fetch/i.test(m)) {
      return `Cannot reach the API (network). ${base} If you use a custom URL, set VITE_API_URL in apps/web.`
    }
  }
  return `Could not load this list. ${base}`
}

export default function OrganizerAthletes() {
  const [athletes, setAthletes] = useState<AthleteWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [seasonFilter, setSeasonFilter] = useState<'active' | 'inactive'>('active')
  const [listSearch, setListSearch] = useState('')
  const [sportFilter, setSportFilter] = useState<Sport | ''>('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  const { profile } = useAuthStore()
  const isSuperAdmin = profile?.role === 'Admin'
  const { sportOptionsForForms } = useOrganizerSportScope()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'set_inactive' | 'set_active' | null>(
    null,
  )
  const [seasonToggleConfirm, setSeasonToggleConfirm] = useState<{
    id: string
    name: string
    nextInactive: boolean
  } | null>(null)
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const [resetPasswordBusy, setResetPasswordBusy] = useState(false)
  const [resetPasswordResult, setResetPasswordResult] = useState<
    { name: string; mode: 'email' } | { name: string; mode: 'password'; tempPassword: string } | null
  >(null)
  const [resetPasswordCopied, setResetPasswordCopied] = useState(false)

  // Whether an admin-triggered reset can rely on email delivery — off until
  // SMTP is configured server-side (see utils/accountEmail.ts).
  const [inviteEmailsEnabled, setInviteEmailsEnabled] = useState(false)
  useEffect(() => {
    api
      .get<{ inviteEmailsEnabled: boolean }>('/admin/config')
      .then(({ data }) => setInviteEmailsEnabled(data.inviteEmailsEnabled))
      .catch(() => setInviteEmailsEnabled(false))
  }, [])

  // Add single athlete
  const [showAddAthlete, setShowAddAthlete] = useState(false)
  const [addName, setAddName] = useState('')
  const [addStudentId, setAddStudentId] = useState('')
  const [addDepartment, setAddDepartment] = useState<string>('SBMA')
  const [addSport, setAddSport] = useState<Sport | ''>('')
  const [addYearLevel, setAddYearLevel] = useState('')
  const [addCourse, setAddCourse] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addAthleteBusy, setAddAthleteBusy] = useState(false)
  const [addAthleteError, setAddAthleteError] = useState('')
  const [addAthleteResult, setAddAthleteResult] = useState<{
    name: string
    email: string
    mode: 'invited' | 'password'
    tempPassword?: string
  } | null>(null)
  const [addAthleteResultCopied, setAddAthleteResultCopied] = useState(false)

  const resetAddAthleteForm = () => {
    setAddName('')
    setAddStudentId('')
    setAddDepartment('SBMA')
    setAddSport('')
    setAddYearLevel('')
    setAddCourse('')
    setAddEmail('')
    setAddAthleteError('')
  }

  const handleAddAthlete = async () => {
    if (!addName.trim()) return setAddAthleteError('Full name is required')
    if (!addStudentId.trim()) return setAddAthleteError('Student ID is required')
    if (!addSport) return setAddAthleteError('Sport is required')
    // Left blank, this falls back to a generated @students.nu-dasma.edu.ph
    // address server-side (already correctly domained) -- only validate it
    // when the organizer actually typed one in.
    if (addEmail.trim()) {
      const parsedEmail = studentEmailZ.safeParse(addEmail.trim())
      if (!parsedEmail.success) {
        return setAddAthleteError(parsedEmail.error.issues[0]?.message ?? 'Enter a valid email')
      }
    }
    setAddAthleteBusy(true)
    setAddAthleteError('')
    try {
      const { data } = await api.post<{
        athlete: { profile?: { full_name?: string } }
        email: string
        mode: 'invited' | 'password'
        tempPassword?: string
      }>('/athletes', {
        full_name: addName.trim(),
        student_id: addStudentId.trim(),
        department: addDepartment,
        sport: addSport,
        year_level: addYearLevel.trim(),
        course: addCourse.trim(),
        ...(addEmail.trim() ? { email: addEmail.trim() } : {}),
      })
      setAddAthleteResult({
        name: addName.trim(),
        email: data.email,
        mode: data.mode,
        tempPassword: data.tempPassword,
      })
      setAddAthleteResultCopied(false)
      setShowAddAthlete(false)
      resetAddAthleteForm()
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setAddAthleteError(msg ?? 'Could not create athlete')
    } finally {
      setAddAthleteBusy(false)
    }
  }

  // Roster import state (CSV or Excel)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: { student_id: string; email: string; athlete_id: string; tempPassword?: string }[]
    errors: { row: number; error: string }[]
    invited?: boolean
  } | null>(null)
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const importFileRef = useRef<HTMLInputElement>(null)

  const fetchAthletes = () => {
    setLoading(true)
    setLoadMessage('')
    api
      .get<AthleteWithProfile[]>('/athletes', { params: { season_status: seasonFilter } })
      .then((r) => setAthletes(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        setAthletes([])
        setLoadMessage(describeApiLoadError(e))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAthletes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonFilter])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [seasonFilter])


  const filteredAthletes = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    return athletes.filter((a) => {
      if (sportFilter && a.sport !== sportFilter) return false
      if (departmentFilter && (a.department ?? '') !== departmentFilter) return false
      if (!q) return true
      const name = (a.profile?.full_name ?? '').toLowerCase()
      const email = (a.profile?.email ?? '').toLowerCase()
      const sid = (a.student_id ?? '').toLowerCase()
      const dept = (a.department ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || sid.includes(q) || dept.includes(q)
    })
  }, [athletes, listSearch, sportFilter, departmentFilter])

  const visibleIds = filteredAthletes.map((a) => a.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleAthleteSelected = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => n.delete(id))
      } else {
        visibleIds.forEach((id) => n.add(id))
      }
      return n
    })
  }

  const runBulkAthletes = async (action: 'set_inactive' | 'set_active'): Promise<boolean> => {
    const ids = [...selectedIds]
    if (ids.length === 0) return false
    setBulkBusy(true)
    setLoadMessage('')
    try {
      await api.patch('/athletes/bulk', { ids, action })
      setSelectedIds(new Set())
      fetchAthletes()
      return true
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Bulk action failed')
      return false
    } finally {
      setBulkBusy(false)
    }
  }

  const confirmBulkAthletes = async () => {
    if (!bulkConfirmAction) return
    const ok = await runBulkAthletes(bulkConfirmAction)
    if (ok) setBulkConfirmAction(null)
  }

  const confirmSeasonToggle = async () => {
    if (!seasonToggleConfirm) return
    setLoadMessage('')
    try {
      await api.patch(`/athletes/${seasonToggleConfirm.id}/season-status`, {
        season_status: seasonToggleConfirm.nextInactive ? 'inactive' : 'active',
      })
      setSeasonToggleConfirm(null)
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Could not update season status')
    }
  }

  const confirmResetPassword = async (mode: 'email' | 'password') => {
    if (!resetPasswordConfirm) return
    setResetPasswordBusy(true)
    setLoadMessage('')
    try {
      const { data } = await api.post<
        { mode: 'email' } | { mode: 'password'; tempPassword: string }
      >(`/athletes/${resetPasswordConfirm.id}/reset-password`, { mode })
      setResetPasswordResult({ name: resetPasswordConfirm.name, ...data })
      setResetPasswordConfirm(null)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Could not reset password')
    } finally {
      setResetPasswordBusy(false)
    }
  }

  const csvEscape = (value: string | number | boolean | null | undefined) => {
    const s = value == null ? '' : String(value)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const handleExport = () => {
    const headers = [
      'full_name',
      'email',
      'sport',
      'student_id',
      'year_level',
      'department',
      'season_status',
      'position',
      'jersey_number',
    ]
    const rows = filteredAthletes.map((a) =>
      [
        a.profile?.full_name ?? '',
        a.profile?.email ?? '',
        getSportLabel(a.sport as any),
        a.student_id,
        a.year_level,
        a.department,
        a.season_status,
        a.position,
        a.jersey_number ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
    const csv = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `athletes-${seasonFilter}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true)
    try {
      const res = await api.get('/students/import-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'athletes-import-template.xlsx'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setImportResult({
        created: [],
        errors: [{ row: 0, error: 'Could not download template. Is the API running?' }],
      })
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const runPreview = async (file: File) => {
    setPreviewing(true)
    setPreviewRows(null)
    setPreviewError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<{
        rows: ImportPreviewRow[]
        validCount: number
        invalidCount: number
      }>('/students/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPreviewRows(res.data.rows)
    } catch (e: unknown) {
      const msg =
        typeof (e as { response?: { data?: { error?: string } } }).response?.data?.error ===
        'string'
          ? (e as { response: { data: { error: string } } }).response.data.error
          : 'Could not preview this file.'
      setPreviewError(msg)
    } finally {
      setPreviewing(false)
    }
  }

  const resetImportState = () => {
    setImportResult(null)
    setImportFile(null)
    setPreviewRows(null)
    setPreviewError('')
  }

  const handleConfirmImport = async () => {
    if (!previewRows) return
    const validRows = previewRows.filter((r) => r.valid)
    if (validRows.length === 0) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await api.post<{
        created: { student_id: string; email: string; athlete_id: string; tempPassword?: string }[]
        errors: { row: number; error: string }[]
        invited?: boolean
      }>('/students/import', {
        rows: validRows.map((r) => ({
          full_name: r.full_name,
          student_id: r.student_id,
          department: r.department,
          sport: r.sport,
          year_level: r.year_level,
          course: r.course,
          email: r.email,
          password: r.password,
        })),
      })
      setImportResult(res.data)
      if (res.data.created.length > 0) fetchAthletes()
    } catch (e: unknown) {
      const msg =
        typeof (e as { response?: { data?: { error?: string } } }).response?.data?.error ===
        'string'
          ? (e as { response: { data: { error: string } } }).response.data.error
          : 'Import failed'
      setImportResult({ created: [], errors: [{ row: 0, error: msg }] })
    } finally {
      setImporting(false)
    }
  }

  const columns = [
    {
      key: 'select',
      label: (
        <input
          type="checkbox"
          className="rounded border-[var(--border-subtle)] accent-[#0066FF]"
          checked={allVisibleSelected}
          onChange={toggleSelectAll}
          aria-label="Select all visible athletes"
        />
      ),
      width: '2.75rem',
    },
    { key: 'name', label: 'Athlete' },
    { key: 'sport', label: 'Sport' },
    { key: 'student_id', label: 'Student ID' },
    { key: 'year', label: 'Year' },
    { key: 'department', label: 'Department' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
  ]

  return (
    <div className={cn('space-y-6', selectedIds.size > 0 && 'pb-24')}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Athletes</h1>
          <p className="text-[var(--text-muted)] text-sm">
            {filteredAthletes.length !== athletes.length
              ? `${filteredAthletes.length} of ${athletes.length} athletes · ${seasonFilter}`
              : `${athletes.length} ${seasonFilter} athletes`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<UserPlus className="w-4 h-4" />}
            onClick={() => {
              resetAddAthleteForm()
              setShowAddAthlete(true)
            }}
            data-tour="athletes-add"
          >
            Add athlete
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => {
              setImportResult(null)
              setImportFile(null)
              setShowImport(true)
            }}
            data-tour="athletes-import"
          >
            Import roster
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="w-4 h-4" />}
            onClick={handleExport}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={fetchAthletes}
            aria-label="Refresh"
          />
        </div>
      </div>

      {loadMessage && (
        <Alert type="danger" onDismiss={() => setLoadMessage('')}>
          {loadMessage}
        </Alert>
      )}

      {/* Active / Inactive segmented filter */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-elevated)] w-fit">
        {(['active', 'inactive'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeasonFilter(s)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              seasonFilter === s
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {s === 'active' ? 'Activated' : 'Deactivated'}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0">
          <Input
            label="Search"
            placeholder="Name, email, student ID, or department"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-full sm:w-44 shrink-0">
          <Select
            label="Sport"
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value as Sport | '')}
            options={SPORT_FILTER_OPTIONS}
          />
        </div>
        <div className="w-full sm:w-44 shrink-0">
          <Select
            label="Department"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            options={[
              { value: '', label: 'All departments' },
              { value: 'SBMA', label: 'SBMA' },
              { value: 'SECA', label: 'SECA' },
              { value: 'SASE', label: 'SASE' },
              { value: 'SHS', label: 'SHS' },
            ]}
          />
        </div>
      </div>

      <Table
        loading={loading}
        columns={columns}
        data={filteredAthletes.map((a) => ({
          select: (
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="rounded border-[var(--border-subtle)] accent-[#0066FF]"
                checked={selectedIds.has(a.id)}
                onChange={() => toggleAthleteSelected(a.id)}
                aria-label={`Select ${a.profile?.full_name ?? 'athlete'}`}
              />
            </div>
          ),
          name: (
            <div>
              <p className="font-medium">{a.profile?.full_name}</p>
              <p className="text-xs text-[var(--text-muted)]">{a.profile?.email}</p>
            </div>
          ),
          sport: (
            <span>
              {getSportIcon(a.sport as any)} {getSportLabel(a.sport as any)}
            </span>
          ),
          student_id: <code className="text-xs">{a.student_id}</code>,
          year: <span className="text-sm">{a.year_level}</span>,
          department: <span className="text-sm">{a.department}</span>,
          status: (
            <Badge variant={a.season_status === 'active' ? 'success' : 'default'} size="sm">
              {a.season_status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          ),
          actions: (
            <div className="flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSeasonToggleConfirm({
                    id: a.id,
                    name: a.profile?.full_name ?? 'this athlete',
                    nextInactive: a.season_status === 'active',
                  })
                }
              >
                {a.season_status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setResetPasswordConfirm({ id: a.id, name: a.profile?.full_name ?? 'this athlete' })
                }
              >
                Reset password
              </Button>
            </div>
          ),
        }))}
        emptyMessage={
          athletes.length > 0 && filteredAthletes.length === 0
            ? 'No athletes match your search or filters. Try different keywords or reset filters.'
            : seasonFilter === 'active'
              ? 'No active athletes. Import athletes or reactivate deactivated ones.'
              : 'No inactive athletes.'
        }
      />

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-medium tabular-nums text-[var(--text-secondary)]">
            {selectedIds.size} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
            >
              Clear selection
            </Button>
            {seasonFilter === 'active' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={bulkBusy}
                onClick={() => setBulkConfirmAction('set_inactive')}
              >
                Set inactive
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={bulkBusy}
                onClick={() => setBulkConfirmAction('set_active')}
              >
                Set active
              </Button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={bulkConfirmAction !== null}
        onClose={() => {
          if (!bulkBusy) setBulkConfirmAction(null)
        }}
        title="Confirm bulk action"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            {bulkConfirmAction === 'set_inactive' ? (
              <>
                Set season status to <strong>inactive</strong> for{' '}
                <span className="font-semibold tabular-nums">{selectedIds.size}</span> selected
                athletes?
              </>
            ) : (
              <>
                Set season status to <strong>active</strong> for{' '}
                <span className="font-semibold tabular-nums">{selectedIds.size}</span> selected
                athletes?
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setBulkConfirmAction(null)}
              disabled={bulkBusy}
            >
              Cancel
            </Button>
            <Button loading={bulkBusy} onClick={() => void confirmBulkAthletes()}>
              Continue
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={seasonToggleConfirm !== null}
        onClose={() => setSeasonToggleConfirm(null)}
        title={seasonToggleConfirm?.nextInactive ? 'Deactivate athlete' : 'Reactivate athlete'}
        size="md"
      >
        {seasonToggleConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {seasonToggleConfirm.nextInactive ? (
                <>
                  Deactivate <span className="font-semibold">{seasonToggleConfirm.name}</span> for
                  this season? They will no longer appear as eligible for roster placement while
                  inactive.
                </>
              ) : (
                <>
                  Reactivate <span className="font-semibold">{seasonToggleConfirm.name}</span> for
                  this season?
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSeasonToggleConfirm(null)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmSeasonToggle()}>Continue</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={resetPasswordConfirm !== null}
        onClose={() => setResetPasswordConfirm(null)}
        title="Reset password"
        size="md"
      >
        {resetPasswordConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Reset the password for{' '}
              <span className="font-semibold">{resetPasswordConfirm.name}</span>? Their current
              password stops working immediately.
            </p>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button
                variant="secondary"
                onClick={() => setResetPasswordConfirm(null)}
                disabled={resetPasswordBusy}
              >
                Cancel
              </Button>
              {inviteEmailsEnabled ? (
                <>
                  <Button
                    variant="secondary"
                    loading={resetPasswordBusy}
                    onClick={() => void confirmResetPassword('password')}
                  >
                    Use temporary password
                  </Button>
                  <Button loading={resetPasswordBusy} onClick={() => void confirmResetPassword('email')}>
                    Send reset email
                  </Button>
                </>
              ) : (
                <Button loading={resetPasswordBusy} onClick={() => void confirmResetPassword('password')}>
                  Generate new password
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={resetPasswordResult !== null}
        onClose={() => {
          setResetPasswordResult(null)
          setResetPasswordCopied(false)
        }}
        title="Password reset"
        size="md"
      >
        {resetPasswordResult?.mode === 'email' ? (
          <div className="space-y-4">
            <Alert type="success">
              Reset email sent to <span className="font-semibold">{resetPasswordResult.name}</span>.
              They'll get a link to choose a new password.
            </Alert>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setResetPasswordResult(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : resetPasswordResult?.mode === 'password' ? (
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
        ) : null}
      </Modal>

      {/* Add single athlete */}
      <Modal
        open={showAddAthlete}
        onClose={() => {
          if (!addAthleteBusy) setShowAddAthlete(false)
        }}
        title="Add athlete"
      >
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {inviteEmailsEnabled
            ? "Sends an email invite. They'll set their own password to finish setting up."
            : 'Creates their login immediately with a generated password shown after saving.'}
        </p>
        {addAthleteError && (
          <Alert type="danger" className="mb-4">
            {addAthleteError}
          </Alert>
        )}
        <div className="space-y-4">
          <Input
            label="Full name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Athlete name"
          />
          <Input
            label="Student ID"
            value={addStudentId}
            onChange={(e) => setAddStudentId(e.target.value)}
            placeholder="2024-1001"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Department"
              value={addDepartment}
              onChange={(e) => setAddDepartment(e.target.value)}
              options={DEPARTMENT_OPTIONS.map((d) => ({ value: d.value, label: d.label }))}
            />
            <Select
              label="Sport"
              value={addSport}
              onChange={(e) => setAddSport(e.target.value as Sport)}
              options={[{ value: '', label: 'Select a sport' }, ...sportOptionsForForms]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Year level (optional)"
              value={addYearLevel}
              onChange={(e) => setAddYearLevel(e.target.value)}
              placeholder="1st Year"
            />
            <Input
              label="Course (optional)"
              value={addCourse}
              onChange={(e) => setAddCourse(e.target.value)}
              placeholder="BSIT"
            />
          </div>
          <Input
            label="Email (optional)"
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="Leave blank to generate one from the student ID"
          />
          <Button className="w-full" loading={addAthleteBusy} onClick={() => void handleAddAthlete()}>
            {inviteEmailsEnabled ? 'Send invitation' : 'Create account'}
          </Button>
        </div>
      </Modal>

      {/* Add single athlete result */}
      <Modal
        open={addAthleteResult !== null}
        onClose={() => {
          setAddAthleteResult(null)
          setAddAthleteResultCopied(false)
        }}
        title="Athlete added"
        size="md"
      >
        {addAthleteResult && (
          <div className="space-y-4">
            <Alert type="success">
              <span className="font-semibold">{addAthleteResult.name}</span> was added with the
              email <span className="font-semibold">{addAthleteResult.email}</span>.{' '}
              {addAthleteResult.mode === 'invited'
                ? "They'll get an email to set their own password."
                : 'This is shown once — copy it now and relay it to them directly.'}
            </Alert>
            {addAthleteResult.mode === 'password' && addAthleteResult.tempPassword && (
              <div className="flex gap-2">
                <Input readOnly value={addAthleteResult.tempPassword} className="font-mono" />
                <Button
                  variant="secondary"
                  icon={
                    addAthleteResultCopied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )
                  }
                  onClick={async () => {
                    await navigator.clipboard.writeText(addAthleteResult.tempPassword ?? '')
                    setAddAthleteResultCopied(true)
                  }}
                >
                  {addAthleteResultCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setAddAthleteResult(null)
                  setAddAthleteResultCopied(false)
                }}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Roster import modal (CSV or Excel) */}
      <Modal
        open={showImport}
        onClose={() => {
          if (!importing) {
            setShowImport(false)
            resetImportState()
          }
        }}
        title="Import athletes from CSV or Excel"
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                What to include in your spreadsheet
              </p>
              <Button
                size="sm"
                variant="secondary"
                icon={<Download className="w-3.5 h-3.5" />}
                loading={downloadingTemplate}
                onClick={handleDownloadTemplate}
              >
                Download template
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-xs">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Full Name <span className="text-[var(--danger)]">*</span>
                </p>
                <p className="text-[var(--text-muted)]">Student's complete name</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Student ID <span className="text-[var(--danger)]">*</span>
                </p>
                <p className="text-[var(--text-muted)]">School ID number</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Department <span className="text-[var(--danger)]">*</span>
                </p>
                <p className="text-[var(--text-muted)]">SBMA, SECA, SASE, or SHS</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Sport</p>
                <p className="text-[var(--text-muted)]">basketball, volleyball, or table-tennis</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Year Level</p>
                <p className="text-[var(--text-muted)]">e.g. 1st Year, Grade 12</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Course</p>
                <p className="text-[var(--text-muted)]">e.g. BSIT, BSCS, BSBA</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Email</p>
                <p className="text-[var(--text-muted)]">Leave blank to auto-generate</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Password</p>
                <p className="text-[var(--text-muted)]">Leave blank to auto-generate</p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2">
              <span className="text-[var(--danger)]">*</span> Required &nbsp;·&nbsp; Auto login —
              Email: <em>studentid@students.nu-dasma.edu.ph</em> &nbsp;·&nbsp; Password:{' '}
              <em>UrSports-studentid-2026!</em>
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-muted)]">CSV or Excel file</p>
            <input
              ref={importFileRef}
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Choose CSV or Excel file to import"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setImportFile(file)
                setImportResult(null)
                setPreviewRows(null)
                setPreviewError('')
                if (file) void runPreview(file)
              }}
            />
            <div
              className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors ${
                importFile
                  ? 'border-[var(--accent-default)]/50 bg-[var(--accent-default)]/5'
                  : 'border-[var(--border-subtle)] hover:border-[var(--accent-default)]/40'
              }`}
              onClick={() => importFileRef.current?.click()}
            >
              <Upload className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
              {importFile ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{importFile.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {(importFile.size / 1024).toFixed(1)} KB · click to change
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-[var(--text-muted)]">
                    Click to choose a .csv or .xlsx file
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Max 5 MB</p>
                </div>
              )}
            </div>
          </div>

          {previewing && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Reading file…
            </div>
          )}

          {previewError && !previewing && <Alert type="danger">{previewError}</Alert>}

          {previewRows && !previewing && !importResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  Preview — {previewRows.length} row{previewRows.length !== 1 ? 's' : ''} found
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">
                    {previewRows.filter((r) => r.valid).length} will import
                  </Badge>
                  {previewRows.some((r) => !r.valid) && (
                    <Badge variant="danger" size="sm">
                      {previewRows.filter((r) => !r.valid).length} will be skipped
                    </Badge>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Table
                  columns={[
                    { key: 'status', label: '', width: '70px' },
                    { key: 'full_name', label: 'Name' },
                    { key: 'student_id', label: 'Student ID' },
                    { key: 'department', label: 'Dept' },
                    { key: 'sport', label: 'Sport' },
                    { key: 'email', label: 'Email' },
                  ]}
                  data={previewRows.map((r) => ({
                    status: r.valid ? (
                      <Badge variant="success" size="sm">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm" className="whitespace-normal text-left">
                        {r.error}
                      </Badge>
                    ),
                    full_name: r.full_name || '—',
                    student_id: r.student_id || '—',
                    department: r.department || '—',
                    sport: r.sport || '—',
                    email: r.email || '—',
                  }))}
                />
              </div>
            </div>
          )}

          {importResult && (
            <div className="space-y-3">
              {importResult.created.length > 0 && (
                <Alert type="success">
                  <span className="font-semibold">
                    {importResult.created.length} athlete
                    {importResult.created.length !== 1 ? 's' : ''} imported successfully.
                  </span>{' '}
                  They are immediately active.{' '}
                  {importResult.invited
                    ? "They'll each get an email invite to set their own password."
                    : 'Their generated passwords are shown below — this is the only time they’re shown, so copy them before closing this dialog.'}
                </Alert>
              )}
              {!importResult.invited && importResult.created.some((c) => c.tempPassword) && (
                <div className="max-h-48 overflow-y-auto">
                  <Table
                    columns={[
                      { key: 'student_id', label: 'Student ID' },
                      { key: 'email', label: 'Email' },
                      { key: 'password', label: 'Password' },
                    ]}
                    data={importResult.created.map((c) => ({
                      student_id: c.student_id,
                      email: c.email,
                      password: <span className="font-mono text-xs">{c.tempPassword}</span>,
                    }))}
                  />
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3 space-y-1.5 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {importResult.errors.length} row{importResult.errors.length !== 1 ? 's' : ''}{' '}
                    failed
                  </p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-[var(--text-secondary)]">
                      {e.row > 0 ? (
                        <span className="font-mono text-[var(--text-muted)]">Row {e.row}: </span>
                      ) : null}
                      {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={importing}
              onClick={() => {
                setShowImport(false)
                resetImportState()
              }}
            >
              {importResult ? 'Close' : 'Cancel'}
            </Button>
            {!importResult && previewRows && (
              <Button
                loading={importing}
                disabled={previewing || previewRows.filter((r) => r.valid).length === 0}
                icon={<Upload className="w-4 h-4" />}
                onClick={() => void handleConfirmImport()}
              >
                Confirm import ({previewRows.filter((r) => r.valid).length})
              </Button>
            )}
            {importResult &&
              importResult.errors.length > 0 &&
              importResult.created.length === 0 && (
                <Button icon={<Upload className="w-4 h-4" />} onClick={resetImportState}>
                  Try again
                </Button>
              )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
