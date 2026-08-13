import React, { useEffect, useMemo, useRef, useState } from 'react'

import { Link, useNavigate, useSearchParams } from 'react-router'

import {
  Plus,
  Star,
  Pencil,
  Trash2,
  UserPlus,
  Search,
  Eye,
  Upload,
  Download,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

import {
  Button,
  Card,
  Modal,
  Input,
  Select,
  EmptyState,
  Alert,
  Skeleton,
  Badge,
  Table,
} from '../../components/ui'

import axios from 'axios'

import api from '../../lib/api'

import { supabase } from '../../lib/supabase'

import type { Team, Season } from '../../types'

import { getSportIcon, getSportLabel, getInitials } from '../../lib/utils'

import { useAuthStore } from '../../stores/authStore'

import { fetchSeasonsForEventForms } from '../../lib/seasonsLookup'

import { useOrganizerSportScope } from '../../hooks/useOrganizerSportScope'

function rosterMaxFor(sport: string) {
  if (sport === 'basketball') return 15
  if (sport === 'volleyball') return 12
  if (sport === 'table-tennis') return 8
  return 15
}

function activeSlotsFor(sport: string) {
  if (sport === 'basketball') return 5
  if (sport === 'volleyball') return 6
  if (sport === 'table-tennis') return 2 // show max (doubles); actual per-event
  return 5
}

type TeamImportRow = {
  row: number
  valid: boolean
  error?: string
  warning?: string
  team_name?: string
  sport?: string
  department?: string
  student_id?: string
  full_name?: string
  lineup?: 'active' | 'bench'
}

type TeamImportGroup = {
  team_name: string
  sport: string
  department: string | null
  exists: boolean
  team_id: string | null
  will_create: boolean
  existing_count: number
  max_roster: number
  to_add: number
  active_requested: number
  max_active: number
  error?: string
}

export default function OrganizerTeams() {
  const { organizer, profile } = useAuthStore()

  const { canConfigureSport, sportOptionsForForms, hasFullSportAccess, assignedSports } =
    useOrganizerSportScope()

  const canCreateTeams = sportOptionsForForms.length > 0

  const navigate = useNavigate()

  const [searchParams] = useSearchParams()

  const highlightTeamId = searchParams.get('teamId')?.trim() ?? null

  const [teams, setTeams] = useState<(Team & { members: any[]; coaches: any[] })[]>([])

  const [seasons, setSeasons] = useState<Season[]>([])

  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)

  const [creating, setCreating] = useState(false)

  const [form, setForm] = useState<{
    name: string
    sport: string
    season_id: string
    department: string
  }>({ name: '', sport: 'basketball', season_id: '', department: '' })

  const [error, setError] = useState('')

  const [listError, setListError] = useState('')

  const [teamListSearch, setTeamListSearch] = useState('')

  const [teamSeasonFilter, setTeamSeasonFilter] = useState('')

  const [teamDepartmentFilter, setTeamDepartmentFilter] = useState('')

  const [teamSportFilter, setTeamSportFilter] = useState('')

  const [editTeam, setEditTeam] = useState<(Team & { members: any[] }) | null>(null)

  const [editForm, setEditForm] = useState<{
    name: string
    sport: string
    season_id: string
    department: string
  }>({
    name: '',

    sport: 'basketball',

    season_id: '',

    department: '',
  })

  const [editError, setEditError] = useState('')

  const [savingEdit, setSavingEdit] = useState(false)

  const [eligibleAthletes, setEligibleAthletes] = useState<
    { id: string; student_id?: string; profile?: { full_name?: string } }[]
  >([])

  const [eligibleLoading, setEligibleLoading] = useState(false)

  const [eligibleAthletesFetchError, setEligibleAthletesFetchError] = useState('')

  const [rosterBusy, setRosterBusy] = useState(false)

  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null)

  // Team roster import state (CSV or Excel) — mirrors the athlete import in Athletes.tsx
  const [showTeamImport, setShowTeamImport] = useState(false)
  const [teamImportFile, setTeamImportFile] = useState<File | null>(null)
  const [teamImportSeasonId, setTeamImportSeasonId] = useState('')
  const [teamImportCreateMissing, setTeamImportCreateMissing] = useState(true)
  const [teamImporting, setTeamImporting] = useState(false)
  const [teamImportDownloading, setTeamImportDownloading] = useState(false)
  const [teamImportPreview, setTeamImportPreview] = useState<{
    rows: TeamImportRow[]
    teams: TeamImportGroup[]
    validCount: number
    invalidCount: number
  } | null>(null)
  const [teamImportPreviewing, setTeamImportPreviewing] = useState(false)
  const [teamImportPreviewError, setTeamImportPreviewError] = useState('')
  const [teamImportResult, setTeamImportResult] = useState<{
    created_teams: { team_id: string; name: string; sport: string }[]
    added: { row: number; team_name: string; student_id: string; lineup_slot: number | null }[]
    errors: { row: number; error: string }[]
  } | null>(null)
  const teamImportFileRef = useRef<HTMLInputElement>(null)

  const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{
    membershipId: string
    label: string
  } | null>(null)

  const [coachLeaveConfirm, setCoachLeaveConfirm] = useState<{
    teamId: string
    teamName: string
  } | null>(null)

  const [coachBusy, setCoachBusy] = useState(false)

  const [rosterSuccess, setRosterSuccess] = useState('')

  const [savingLineupId, setSavingLineupId] = useState<string | null>(null)

  const [savingJerseyId, setSavingJerseyId] = useState<string | null>(null)

  // Keyed by athlete_id, not membership id — jersey_number lives on the
  // athlete row, one value regardless of which team roster it's edited from.
  // Local drafts so typing doesn't fire a PATCH per keystroke; committed
  // onBlur/Enter.
  const [jerseyDrafts, setJerseyDrafts] = useState<Record<string, string>>({})

  const [selectedRosterMemberIds, setSelectedRosterMemberIds] = useState<string[]>([])

  const [selectedAthleteIdsToAdd, setSelectedAthleteIdsToAdd] = useState<string[]>([])

  const [rosterBulkBusy, setRosterBulkBusy] = useState(false)

  const [bulkRemoveMembershipIds, setBulkRemoveMembershipIds] = useState<string[] | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<(Team & { members: any[] }) | null>(null)

  const [deleteError, setDeleteError] = useState('')

  const [deleting, setDeleting] = useState(false)

  const fetchTeams = () => {
    setListError('')

    setLoading(true)

    return api

      .get('/teams')

      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : []

        setTeams(rows)
      })

      .catch((e: unknown) => {
        setTeams([])

        if (axios.isAxiosError(e)) {
          const msg =
            typeof e.response?.data === 'object' && e.response?.data && 'error' in e.response.data
              ? String((e.response.data as { error?: string }).error)
              : e.message

          setListError(
            msg ||
              (e.code === 'ECONNABORTED'
                ? 'Request timed out loading teams.'
                : 'Could not load teams — is the API running? Check VITE_API_URL in apps/web/.env (e.g. http://localhost:3001/api).'),
          )
        } else {
          setListError('Could not load teams.')
        }
      })

      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchTeams()

    fetchSeasonsForEventForms()
      .then(setSeasons)
      .catch(() => setSeasons([]))
  }, [])

  useEffect(() => {
    if (!highlightTeamId || teams.length === 0) return

    if (!teams.some((t) => t.id === highlightTeamId)) return

    const t = window.setTimeout(() => {
      document
        .getElementById(`team-card-${highlightTeamId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)

    return () => window.clearTimeout(t)
  }, [highlightTeamId, teams])

  useEffect(() => {
    if (!showCreate || sportOptionsForForms.length === 0) return

    setForm((f) =>
      sportOptionsForForms.some((o) => o.value === f.sport)
        ? f
        : { ...f, sport: sportOptionsForForms[0]!.value },
    )
  }, [showCreate, sportOptionsForForms])

  useEffect(() => {
    if (!showCreate || seasons.length === 0) return

    setForm((prev) => {
      if (prev.season_id) return prev

      const pick = seasons.find((s) => s.status === 'active') ?? seasons[0]!

      return { ...prev, season_id: pick.id }
    })
  }, [showCreate, seasons])

  useEffect(() => {
    if (!editTeam) {
      setEligibleAthletes([])

      return
    }

    let cancelled = false

    setEligibleLoading(true)

    setEligibleAthletesFetchError('')

    api

      .get('/athletes', {
        params: {
          sport: editTeam.sport,

          season_status: 'active',

          ...(editTeam.department ? { department: editTeam.department } : {}),
        },
      })

      .then((r) => {
        if (!cancelled) {
          setEligibleAthletes(Array.isArray(r.data) ? r.data : [])

          setEligibleAthletesFetchError('')
        }
      })

      .catch(() => {
        if (!cancelled) {
          setEligibleAthletes([])

          setEligibleAthletesFetchError(
            'Could not load athletes. Check the API server and try again.',
          )
        }
      })

      .finally(() => {
        if (!cancelled) setEligibleLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [editTeam?.id, editTeam?.sport])

  const occupiedRosterKeys = useMemo(() => {
    if (!editTeam) return { athleteIds: new Set<string>(), profileIds: new Set<string>() }

    const athleteIds = new Set<string>()

    const profileIds = new Set<string>()

    for (const t of teams) {
      if (t.id === editTeam.id) continue

      if (t.season_id !== editTeam.season_id || t.sport !== editTeam.sport) continue

      for (const m of (t.members ?? []) as Array<{
        athlete_id?: string | null

        student_profile_id?: string | null

        athlete?: { id?: string; profile_id?: string } | null

        student_profile?: { id?: string } | null
      }>) {
        if (m.student_profile_id) profileIds.add(m.student_profile_id)

        const spid = m.student_profile?.id

        if (spid) profileIds.add(spid)

        const aid = m.athlete?.id ?? m.athlete_id

        if (aid) athleteIds.add(aid)

        const pid = m.athlete?.profile_id

        if (pid) profileIds.add(pid)
      }
    }

    return { athleteIds, profileIds }
  }, [editTeam?.id, editTeam?.season_id, editTeam?.sport, teams])

  const refreshEditTeam = async () => {
    if (!editTeam) return

    try {
      const { data } = await api.get(`/teams/${editTeam.id}`)

      const row = data as Team & { members: any[] }

      setEditTeam(row)

      setEditForm((f) => ({
        ...f,

        name: row.name,

        sport: row.sport,

        season_id: row.season_id,

        department: row.department ?? f.department,
      }))
    } catch {
      setEditError('Could not refresh team roster.')
    }

    await fetchTeams()

    setSelectedRosterMemberIds([])
  }

  const openEdit = async (team: Team & { members: any[] }) => {
    if (!canConfigureSport(team.sport)) return

    setEditError('')

    let merged = seasons

    if (!merged.some((s) => s.id === team.season_id)) {
      const { data } = await supabase
        .from('seasons')
        .select('*')
        .eq('id', team.season_id)
        .maybeSingle()

      if (data) {
        merged = [...merged, data as Season]

        setSeasons(merged)
      }
    }

    setRosterSuccess('')

    setSelectedRosterMemberIds([])

    setSelectedAthleteIdsToAdd([])

    setEditTeam(team)

    setEditForm({
      name: team.name,

      sport: team.sport,

      season_id: team.season_id,

      department: team.department ?? '',
    })

    try {
      const { data } = await api.get(`/teams/${team.id}`)

      const full = data as Team & { members: any[] }

      setEditTeam(full)

      setEditForm((f) => ({
        ...f,

        name: full.name,

        sport: full.sport,

        season_id: full.season_id,

        department: full.department ?? f.department,
      }))
    } catch {
      setEditError(
        'Could not load full team from the server. You can still edit; try Save, or check VITE_API_URL and that the API is running.',
      )
    }
  }

  const handleCreate = async () => {
    const name = form.name.trim()

    if (!name) {
      setError('Enter a team name.')

      return
    }

    if (!form.season_id) {
      setError(
        'Select a season. If none appear, ask a Super Admin to create one (Super Admin → Seasons) — new seasons start as Draft until Activated.',
      )

      return
    }

    setCreating(true)

    setError('')

    try {
      await api.post('/teams', { ...form, name })

      setShowCreate(false)

      setForm({
        name: '',
        sport: sportOptionsForForms[0]?.value ?? 'basketball',
        season_id: seasons.find((s) => s.status === 'active')?.id ?? seasons[0]?.id ?? '',
        department: '',
      })

      fetchTeams()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setError(
          apiErr ??
            (e.code === 'ECONNABORTED'
              ? 'Request timed out.'
              : e.message ||
                'Network error — is the API running? Set VITE_API_URL in apps/web/.env (e.g. http://localhost:3001/api)'),
        )
      } else {
        setError('Create failed — check API is running (see .env VITE_API_URL).')
      }
    } finally {
      setCreating(false)
    }
  }

  const handleDownloadTeamImportTemplate = async () => {
    setTeamImportDownloading(true)
    try {
      const res = await api.get('/teams/import-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'teams-import-template.xlsx'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setTeamImportPreviewError('Could not download template. Is the API running?')
    } finally {
      setTeamImportDownloading(false)
    }
  }

  const runTeamImportPreview = async (file: File) => {
    if (!teamImportSeasonId) {
      setTeamImportPreviewError('Select a season first, then choose your file.')
      return
    }
    setTeamImportPreviewing(true)
    setTeamImportPreview(null)
    setTeamImportPreviewError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('season_id', teamImportSeasonId)
      fd.append('create_missing_teams', String(teamImportCreateMissing))
      const res = await api.post<{
        rows: TeamImportRow[]
        teams: TeamImportGroup[]
        validCount: number
        invalidCount: number
      }>('/teams/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setTeamImportPreview(res.data)
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && typeof e.response?.data?.error === 'string'
          ? (e.response.data as { error: string }).error
          : 'Could not preview this file.'
      setTeamImportPreviewError(msg)
    } finally {
      setTeamImportPreviewing(false)
    }
  }

  const resetTeamImportState = () => {
    setTeamImportResult(null)
    setTeamImportFile(null)
    setTeamImportPreview(null)
    setTeamImportPreviewError('')
  }

  const handleConfirmTeamImport = async () => {
    if (!teamImportPreview) return
    const validRows = teamImportPreview.rows.filter((r) => r.valid)
    if (validRows.length === 0) return
    setTeamImporting(true)
    setTeamImportResult(null)
    try {
      const res = await api.post<{
        created_teams: { team_id: string; name: string; sport: string }[]
        added: { row: number; team_name: string; student_id: string; lineup_slot: number | null }[]
        errors: { row: number; error: string }[]
      }>('/teams/import', {
        season_id: teamImportSeasonId,
        create_missing_teams: teamImportCreateMissing,
        rows: validRows.map((r) => ({
          team_name: r.team_name,
          sport: r.sport,
          department: r.department,
          student_id: r.student_id,
          full_name: r.full_name,
          lineup: r.lineup,
        })),
      })
      setTeamImportResult(res.data)
      if (res.data.added.length > 0 || res.data.created_teams.length > 0) fetchTeams()
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && typeof e.response?.data?.error === 'string'
          ? (e.response.data as { error: string }).error
          : 'Import failed'
      setTeamImportResult({ created_teams: [], added: [], errors: [{ row: 0, error: msg }] })
    } finally {
      setTeamImporting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editTeam) return

    const name = editForm.name.trim()

    if (!name) {
      setEditError('Enter a team name.')

      return
    }

    if (!editForm.season_id) {
      setEditError('Select a season.')

      return
    }

    setSavingEdit(true)

    setEditError('')

    try {
      const teamId = editTeam.id

      const res = await api.patch(`/teams/${teamId}`, {
        name,

        sport: editForm.sport,

        season_id: editForm.season_id,

        department: editForm.department || null,

        captain_id: null,
      })

      const lineupNormalized = Number(res.data?.lineup_normalized ?? 0)
      if (lineupNormalized > 0) {
        // Switching sport left the active lineup over the new sport's (smaller)
        // cap, so the server auto-benched the overflow — keep the modal open so
        // the organizer sees the updated Active/Bench lists, instead of closing
        // as if nothing but the sport field changed.
        setRosterSuccess(
          `${lineupNormalized} player${lineupNormalized === 1 ? ' was' : 's were'} moved to the bench — ${editForm.sport} allows fewer active players.`,
        )
        await refreshEditTeam()
      } else {
        setEditTeam(null)
      }

      await fetchTeams()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setEditError(apiErr ?? e.message ?? 'Update failed')
      } else {
        setEditError('Update failed')
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)

    setDeleteError('')

    try {
      await api.delete(`/teams/${deleteTarget.id}`)

      setDeleteTarget(null)

      fetchTeams()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setDeleteError(apiErr ?? e.message ?? 'Delete failed')
      } else {
        setDeleteError('Delete failed')
      }
    } finally {
      setDeleting(false)
    }
  }

  const removeMember = async (membershipId: string) => {
    if (!editTeam) return

    setRemovingMembershipId(membershipId)

    setEditError('')

    setRosterSuccess('')

    try {
      await api.delete(`/teams/${editTeam.id}/members/${membershipId}`)

      await refreshEditTeam()

      setRemoveMemberConfirm(null)
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setEditError(apiErr ?? e.message ?? 'Could not remove player')
      } else {
        setEditError('Could not remove player')
      }
    } finally {
      setRemovingMembershipId(null)
    }
  }

  const handleSetSlot = async (memberId: string, slot: number | null) => {
    if (!editTeam) return
    setSavingLineupId(memberId)
    try {
      await api.patch(`/teams/${editTeam.id}/lineup`, {
        slots: [{ member_id: memberId, lineup_slot: slot }],
      })
      await refreshEditTeam()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data
        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null
        setEditError(apiErr ?? 'Could not update lineup')
      } else {
        setEditError('Could not update lineup')
      }
    } finally {
      setSavingLineupId(null)
    }
  }

  const handleSetJersey = async (athleteId: string, rawValue: string) => {
    const value = rawValue.trim()
    setSavingJerseyId(athleteId)
    try {
      await api.patch(`/athletes/${athleteId}/roster-details`, {
        jersey_number: value === '' ? null : value,
      })
      setJerseyDrafts((d) => {
        const next = { ...d }
        delete next[athleteId]
        return next
      })
      await refreshEditTeam()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data
        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null
        setEditError(apiErr ?? 'Could not update jersey number')
      } else {
        setEditError('Could not update jersey number')
      }
    } finally {
      setSavingJerseyId(null)
    }
  }

  const assignSelfAsCoach = async (teamId: string) => {
    setCoachBusy(true)

    setListError('')

    try {
      await api.post(`/teams/${teamId}/coach`, {})

      fetchTeams()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setListError(apiErr ?? e.message ?? 'Could not join as coach')
      } else {
        setListError('Could not join as coach')
      }
    } finally {
      setCoachBusy(false)
    }
  }

  const confirmLeaveCoachRole = async () => {
    if (!coachLeaveConfirm) return

    setCoachBusy(true)

    setListError('')

    try {
      await api.delete(`/teams/${coachLeaveConfirm.teamId}/coach`)

      setCoachLeaveConfirm(null)

      fetchTeams()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setListError(apiErr ?? e.message ?? 'Could not leave coaching role')
      } else {
        setListError('Could not leave coaching role')
      }
    } finally {
      setCoachBusy(false)
    }
  }

  const handleSelfCoachCardClick = (teamId: string, teamName: string, isCoach: boolean) => {
    if (isCoach) {
      setCoachLeaveConfirm({ teamId, teamName })

      return
    }

    void assignSelfAsCoach(teamId)
  }

  const toggleRosterMemberSelect = (id: string) => {
    setSelectedRosterMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleAthleteAddSelect = (id: string) => {
    setSelectedAthleteIdsToAdd((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const executeBulkRemoveMembers = async () => {
    if (!editTeam || !bulkRemoveMembershipIds?.length) return

    const n = bulkRemoveMembershipIds.length

    setRosterBulkBusy(true)

    setEditError('')

    try {
      await api.post(`/teams/${editTeam.id}/members/bulk-remove`, {
        membership_ids: bulkRemoveMembershipIds,
      })

      setBulkRemoveMembershipIds(null)

      setSelectedRosterMemberIds([])

      await refreshEditTeam()

      setRosterSuccess(`Removed ${n} player(s).`)

      window.setTimeout(() => setRosterSuccess(''), 5000)
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setEditError(apiErr ?? e.message ?? 'Could not remove players')
      } else {
        setEditError('Could not remove players')
      }
    } finally {
      setRosterBulkBusy(false)
    }
  }

  const bulkBenchSelected = async () => {
    if (!editTeam || selectedRosterMemberIds.length === 0) return

    const members = editTeam.members ?? []

    const toBench = members.filter(
      (m: any) => selectedRosterMemberIds.includes(m.id) && m.lineup_slot != null,
    )

    if (toBench.length === 0) return

    setRosterBulkBusy(true)

    setEditError('')

    try {
      await api.patch(`/teams/${editTeam.id}/lineup`, {
        slots: toBench.map((m: any) => ({ member_id: m.id, lineup_slot: null })),
      })

      setSelectedRosterMemberIds([])

      await refreshEditTeam()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setEditError(apiErr ?? 'Could not move players to bench')
      } else {
        setEditError('Could not move players to bench')
      }
    } finally {
      setRosterBulkBusy(false)
    }
  }

  const bulkActivateSelected = async () => {
    if (!editTeam || selectedRosterMemberIds.length === 0) return

    const sport = editTeam.sport

    const maxActive = activeSlotsFor(sport)

    const members = editTeam.members ?? []

    const activeMembers = members.filter((m: any) => m.lineup_slot != null)

    const usedSlots = new Set(activeMembers.map((m: any) => m.lineup_slot as number))

    const freeSlots = Array.from({ length: maxActive }, (_, i) => i + 1).filter(
      (s) => !usedSlots.has(s),
    )

    const toPromote = members.filter(
      (m: any) => selectedRosterMemberIds.includes(m.id) && m.lineup_slot == null,
    )

    if (toPromote.length === 0) return

    if (toPromote.length > freeSlots.length) {
      setEditError(
        `Only ${freeSlots.length} active slot(s) open — bench someone first or select fewer players.`,
      )

      return
    }

    const slots = toPromote.map((m: any, idx: number) => ({
      member_id: m.id,
      lineup_slot: freeSlots[idx],
    }))

    setRosterBulkBusy(true)

    setEditError('')

    try {
      await api.patch(`/teams/${editTeam.id}/lineup`, { slots })

      setSelectedRosterMemberIds([])

      await refreshEditTeam()
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setEditError(apiErr ?? 'Could not activate players')
      } else {
        setEditError('Could not activate players')
      }
    } finally {
      setRosterBulkBusy(false)
    }
  }

  const addSelectedAthletesBulk = async () => {
    if (!editTeam || selectedAthleteIdsToAdd.length === 0) return

    const currentCount = (editTeam.members ?? []).length

    const maxRoster = rosterMaxFor(editTeam.sport)

    if (currentCount + selectedAthleteIdsToAdd.length > maxRoster) {
      setEditError(
        `Roster limit exceeded. This team can have at most ${maxRoster} members (currently ${currentCount}).`,
      )

      return
    }

    setRosterBusy(true)

    setEditError('')

    try {
      let added = 0

      for (const aid of selectedAthleteIdsToAdd) {
        await api.post(`/teams/${editTeam.id}/members`, { athlete_id: aid })

        added++
      }

      setSelectedAthleteIdsToAdd([])

      await refreshEditTeam()

      setRosterSuccess(`Added ${added} athlete(s).`)

      window.setTimeout(() => setRosterSuccess(''), 5000)
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data

        const apiErr =
          d && typeof d === 'object' && 'error' in d ? String((d as { error: string }).error) : null

        setEditError(apiErr ?? e.message ?? 'Could not add selected athletes')
      } else {
        setEditError('Could not add selected athletes')
      }
    } finally {
      setRosterBusy(false)
    }
  }

  const athleteIdsOnTeam = new Set(
    (editTeam?.members ?? []).map((m: any) => m.athlete?.id).filter(Boolean) as string[],
  )

  const officialAthletePickRows = eligibleAthletes

    .filter((a) => !athleteIdsOnTeam.has(a.id))

    .filter((a) => {
      if (occupiedRosterKeys.athleteIds.has(a.id)) return false

      const pid = (a as { profile_id?: string }).profile_id

      if (pid && occupiedRosterKeys.profileIds.has(pid)) return false

      return true
    })

    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)

  const teamSeasonFilterOptions = useMemo(() => {
    const known = new Map(seasons.map((s) => [s.id, s]))

    const rows: { value: string; label: string }[] = []

    const seen = new Set<string>()

    for (const t of teams) {
      if (seen.has(t.season_id)) continue

      seen.add(t.season_id)

      const s = known.get(t.season_id)

      const statusSuffix =
        s?.status === 'draft'
          ? ' — draft'
          : s?.status === 'active'
            ? ' — active'
            : s?.status === 'completed'
              ? ' — completed'
              : s?.status === 'archived'
                ? ' — archived'
                : ''

      rows.push({
        value: t.season_id,

        label: s ? `${s.name}${statusSuffix}` : `Season (${t.season_id.slice(0, 8)}…)`,
      })
    }

    rows.sort((a, b) => a.label.localeCompare(b.label))

    return [{ value: '', label: 'All seasons' }, ...rows]
  }, [teams, seasons])

  const filteredTeams = useMemo(() => {
    const q = teamListSearch.trim().toLowerCase()

    const seasonById = new Map(seasons.map((s) => [s.id, s.name]))

    return teams.filter((t) => {
      if (teamSeasonFilter && t.season_id !== teamSeasonFilter) return false

      if (teamDepartmentFilter && (t.department ?? '') !== teamDepartmentFilter) return false

      if (teamSportFilter && t.sport !== teamSportFilter) return false

      if (!q) return true

      const seasonName = seasonById.get(t.season_id) ?? ''

      const sportLabel = getSportLabel(t.sport as any)

      const sportSlug = String(t.sport).replace(/-/g, ' ')

      const haystack =
        `${t.name} ${sportLabel} ${sportSlug} ${seasonName} ${t.department ?? ''}`.toLowerCase()

      return haystack.includes(q)
    })
  }, [teams, seasons, teamListSearch, teamSeasonFilter, teamDepartmentFilter, teamSportFilter])

  const clearTeamListFilters = () => {
    setTeamListSearch('')

    setTeamSeasonFilter('')

    setTeamDepartmentFilter('')

    setTeamSportFilter('')
  }

  const teamListFiltersActive =
    teamListSearch.trim() !== '' ||
    teamSeasonFilter !== '' ||
    teamDepartmentFilter !== '' ||
    teamSportFilter !== ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>

          <p className="text-[var(--text-muted)] text-sm">
            {teams.length} teams
            {filteredTeams.length !== teams.length ? <> · Showing {filteredTeams.length}</> : null}
          </p>

          {!hasFullSportAccess && assignedSports.length > 0 ? (
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xl">
              You can edit teams for {assignedSports.map((s) => getSportLabel(s as any)).join(', ')}{' '}
              only. Other sports are view-only.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            disabled={!canCreateTeams}
            onClick={() => {
              resetTeamImportState()
              setTeamImportSeasonId(seasons.find((s) => s.status === 'active')?.id ?? seasons[0]?.id ?? '')
              setShowTeamImport(true)
            }}
          >
            Import teams
          </Button>

          <Button
            icon={<Plus className="w-4 h-4" />}

            disabled={!canCreateTeams}

            onClick={() => {
              setError('')

              setShowCreate(true)
            }}
          >
            New Team
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : listError ? (
        <div className="space-y-3">
          <Alert type="danger">{listError}</Alert>

          <Button type="button" variant="secondary" onClick={() => void fetchTeams()}>
            Retry
          </Button>
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon="🏅"

          title="No teams yet"

          description="Create teams and assign athletes to them"

          action={
            <Button
              disabled={!canCreateTeams}

              onClick={() => {
                setError('')

                setShowCreate(true)
              }}
            >
              Create Team
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="flex-1 min-w-0 max-w-xl">
              <Input
                label="Search teams"

                placeholder="Name, sport, season, department..."

                value={teamListSearch}

                onChange={(e) => setTeamListSearch(e.target.value)}

                icon={<Search className="w-4 h-4" />}
              />
            </div>

            <div className="w-full sm:w-52 lg:w-56 shrink-0">
              <Select
                label="Season"

                value={teamSeasonFilter}

                onChange={(e) => setTeamSeasonFilter(e.target.value)}

                options={teamSeasonFilterOptions}
              />
            </div>

            <div className="w-full sm:w-52 lg:w-56 shrink-0">
              <Select
                label="Department"

                value={teamDepartmentFilter}

                onChange={(e) => setTeamDepartmentFilter(e.target.value)}

                options={[
                  { value: '', label: 'All departments' },

                  { value: 'SBMA', label: 'SBMA' },

                  { value: 'SECA', label: 'SECA' },

                  { value: 'SASE', label: 'SASE' },

                  { value: 'SHS', label: 'SHS' },
                ]}
              />
            </div>

            <div className="w-full sm:w-52 lg:w-56 shrink-0">
              <Select
                label="Sport"

                value={teamSportFilter}

                onChange={(e) => setTeamSportFilter(e.target.value)}

                options={[
                  { value: '', label: 'All sports' },

                  { value: 'basketball', label: 'Basketball' },

                  { value: 'volleyball', label: 'Volleyball' },

                  { value: 'table-tennis', label: 'Table tennis' },
                ]}
              />
            </div>
          </div>

          {filteredTeams.length === 0 ? (
            <EmptyState
              icon="🔍"

              title="No matching teams"

              description={
                teamListFiltersActive
                  ? 'Nothing matches the current search, season, or department filter. Try widening filters or clearing them.'
                  : 'No teams to show.'
              }

              action={
                teamListFiltersActive ? (
                  <Button type="button" variant="secondary" onClick={clearTeamListFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeams.map((team) => {
                const myProfileId = organizer?.profile_id

                const isCoach = team.coaches?.some(
                  (c: any) => c.organizer?.profile_id === myProfileId,
                )

                const canCfg = canConfigureSport(team.sport)

                // Mirrors the server-side department check in POST /teams/:id/coach —
                // only blocks JOINING a mismatched team, never leaving one, so a coach
                // who ended up on the wrong team (e.g. before this check existed) can
                // still self-remove.
                const deptMismatch =
                  !isCoach &&
                  profile?.role === 'Coach' &&
                  !!profile.department &&
                  !!team.department &&
                  profile.department !== team.department

                return (
                  <div
                    key={team.id}

                    id={`team-card-${team.id}`}

                    className={
                      highlightTeamId === team.id
                        ? 'rounded-xl ring-2 ring-[#0066FF]/45 ring-offset-2 ring-offset-[var(--bg-primary)]'
                        : ''
                    }
                  >
                    <Card>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-xl">{getSportIcon(team.sport as any)}</span>

                          <h3 className="font-bold mt-1 truncate">{team.name}</h3>

                          <p className="text-xs text-[var(--text-muted)]">
                            {getSportLabel(team.sport as any)}
                          </p>

                          {!canCfg ? (
                            <Badge size="sm" variant="default" className="mt-1">
                              View only
                            </Badge>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"

                              size="sm"

                              variant="ghost"

                              title="View public team page"

                              aria-label="View public team page"

                              icon={<Eye className="w-3.5 h-3.5" />}

                              onClick={() => window.open(`/guest/teams/${team.id}`, '_blank')}
                            />

                            <Button
                              type="button"

                              size="sm"

                              variant="ghost"

                              title="Edit team"

                              aria-label="Edit team"

                              disabled={!canCfg}

                              icon={<Pencil className="w-3.5 h-3.5" />}

                              onClick={() => void openEdit(team)}
                            />

                            <Button
                              type="button"

                              size="sm"

                              variant="ghost"

                              title="Delete team"

                              aria-label="Delete team"

                              disabled={!canCfg}

                              icon={<Trash2 className="w-3.5 h-3.5" />}

                              onClick={() => {
                                setDeleteError('')

                                setDeleteTarget(team)
                              }}
                            />
                          </div>

                          <Button
                            size="sm"
                            variant={isCoach ? 'success' : 'secondary'}
                            disabled={!canCfg || coachBusy || deptMismatch}
                            loading={coachBusy}
                            icon={<Star className="w-3 h-3" />}
                            title={
                              deptMismatch
                                ? `You are a ${profile?.department} coach and cannot coach a ${team.department} team.`
                                : undefined
                            }
                            onClick={() => handleSelfCoachCardClick(team.id, team.name, isCoach)}
                          >
                            {isCoach ? 'Coaching' : 'Coach'}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap">
                        {(team.members ?? []).slice(0, 5).map((m: any) => {
                          const face =
                            m.athlete?.profile?.full_name ||
                            m.athlete?.student_id ||
                            m.student_profile?.full_name ||
                            m.student_profile?.student_id ||
                            '?'

                          return (
                            <div
                              key={m.id}

                              className="w-7 h-7 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--school-secondary)]"

                              title={typeof face === 'string' ? face : '?'}
                            >
                              {getInitials(typeof face === 'string' ? face : '?')}
                            </div>
                          )
                        })}

                        {(team.members?.length ?? 0) > 5 && (
                          <span className="text-xs text-[var(--text-muted)] ml-1">
                            +{team.members.length - 5} more
                          </span>
                        )}

                        {(team.members?.length ?? 0) === 0 && (
                          <span className="text-xs text-[var(--text-muted)]">No members yet</span>
                        )}
                      </div>

                      <p className="text-xs text-[var(--text-muted)] mt-2">
                        {team.members?.length ?? 0} players
                      </p>
                    </Card>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={showCreate}

        onClose={() => {
          setShowCreate(false)

          setError('')
        }}

        title="Create Team"
      >
        {error && (
          <Alert type="danger" className="mb-4">
            {error}
          </Alert>
        )}

        {seasons.length === 0 && (
          <Alert type="warning" className="mb-4">
            No <strong>Draft</strong> or <strong>Active</strong> seasons yet. Sign in as Super Admin
            → Seasons → Create, then Activate (or teams can attach to Draft for testing).
          </Alert>
        )}

        <div className="space-y-4">
          <Input
            label="Team Name"
            placeholder="NU Bulldogs"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          <Select
            label="Sport"
            value={form.sport}
            onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}

            options={sportOptionsForForms}
          />

          <Select
            label="Department"
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            options={[
              { value: '', label: 'No department' },
              { value: 'SBMA', label: 'SBMA' },
              { value: 'SECA', label: 'SECA' },
              { value: 'SASE', label: 'SASE' },
              { value: 'SHS', label: 'SHS' },
            ]}
          />

          <Select
            label="Season"
            value={form.season_id}
            onChange={(e) => setForm((f) => ({ ...f, season_id: e.target.value }))}

            options={[
              {
                value: '',
                label: seasons.length
                  ? 'Select season...'
                  : 'No seasons — create one in Super Admin',
              },

              ...seasons.map((s) => ({
                value: s.id,

                label: `${s.name}${s.status === 'draft' ? ' — draft' : s.status === 'active' ? ' — active' : ''}`,
              })),
            ]}
          />

          <Button
            type="button"
            className="w-full"
            loading={creating}
            disabled={!seasons.length || !canCreateTeams}
            onClick={() => void handleCreate()}
          >
            Create Team
          </Button>
        </div>
      </Modal>

      {/* Team roster import (CSV or Excel) — one row per player, team_name repeated */}
      <Modal
        open={showTeamImport}
        onClose={() => {
          if (!teamImporting) {
            setShowTeamImport(false)
            resetTeamImportState()
          }
        }}
        title="Import teams from CSV or Excel"
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
                loading={teamImportDownloading}
                onClick={() => void handleDownloadTeamImportTemplate()}
              >
                Download template
              </Button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              One row per player. Repeat the same <code>team_name</code> on every row for that
              team — one file can fill or create many teams at once.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-xs">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Team Name <span className="text-[var(--danger)]">*</span>
                </p>
                <p className="text-[var(--text-muted)]">Same on every row for that team</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Sport <span className="text-[var(--danger)]">*</span>
                </p>
                <p className="text-[var(--text-muted)]">basketball, volleyball, or table-tennis</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Department</p>
                <p className="text-[var(--text-muted)]">SBMA, SECA, SASE, or SHS</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Student ID <span className="text-[var(--danger)]">*</span>
                </p>
                <p className="text-[var(--text-muted)]">Must already exist under Athletes</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Full Name</p>
                <p className="text-[var(--text-muted)]">For your own verification only</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Lineup</p>
                <p className="text-[var(--text-muted)]">active or bench — blank defaults to bench</p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-2">
              <span className="text-[var(--danger)]">*</span> Required &nbsp;·&nbsp; Athletes must
              already be imported and active — this only fills rosters, it never creates athlete
              accounts.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Season"
              value={teamImportSeasonId}
              onChange={(e) => {
                setTeamImportSeasonId(e.target.value)
                resetTeamImportState()
              }}
              options={[
                {
                  value: '',
                  label: seasons.length ? 'Select season...' : 'No seasons — create one in Super Admin',
                },
                ...seasons.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.status === 'draft' ? ' — draft' : s.status === 'active' ? ' — active' : ''}`,
                })),
              ]}
            />
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={teamImportCreateMissing}
                  onChange={(e) => setTeamImportCreateMissing(e.target.checked)}
                  className="rounded"
                />
                Create teams that don't exist yet
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-muted)]">CSV or Excel file</p>
            <input
              ref={teamImportFileRef}
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Choose CSV or Excel file to import"
              className="hidden"
              disabled={!teamImportSeasonId}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setTeamImportFile(file)
                setTeamImportResult(null)
                setTeamImportPreview(null)
                setTeamImportPreviewError('')
                if (file) void runTeamImportPreview(file)
              }}
            />
            <div
              className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors ${
                !teamImportSeasonId
                  ? 'border-[var(--border-subtle)] opacity-50 cursor-not-allowed'
                  : teamImportFile
                    ? 'border-[var(--accent-default)]/50 bg-[var(--accent-default)]/5 cursor-pointer'
                    : 'border-[var(--border-subtle)] hover:border-[var(--accent-default)]/40 cursor-pointer'
              }`}
              onClick={() => teamImportSeasonId && teamImportFileRef.current?.click()}
            >
              <Upload className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
              {teamImportFile ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{teamImportFile.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {(teamImportFile.size / 1024).toFixed(1)} KB · click to change
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {teamImportSeasonId
                      ? 'Click to choose a .csv or .xlsx file'
                      : 'Select a season first'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Max 5 MB</p>
                </div>
              )}
            </div>
          </div>

          {teamImportPreviewing && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Reading file…
            </div>
          )}

          {teamImportPreviewError && !teamImportPreviewing && (
            <Alert type="danger">{teamImportPreviewError}</Alert>
          )}

          {teamImportPreview && !teamImportPreviewing && !teamImportResult && (
            <div className="space-y-3">
              {teamImportPreview.teams.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                    Teams in this file
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {teamImportPreview.teams.map((g, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-xs rounded-lg bg-[var(--surface-elevated)] px-2.5 py-1.5"
                      >
                        <span className="truncate">
                          <span className="font-medium">{g.team_name}</span>{' '}
                          <span className="text-[var(--text-muted)]">({g.sport})</span>
                        </span>
                        {g.error ? (
                          <Badge variant="danger" size="sm">
                            {g.error}
                          </Badge>
                        ) : g.will_create ? (
                          <Badge variant="success" size="sm">
                            Create · {g.to_add} player{g.to_add !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge size="sm">
                            +{g.to_add} to {g.existing_count}/{g.max_roster}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  Preview — {teamImportPreview.rows.length} row
                  {teamImportPreview.rows.length !== 1 ? 's' : ''} found
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">
                    {teamImportPreview.validCount} will import
                  </Badge>
                  {teamImportPreview.invalidCount > 0 && (
                    <Badge variant="danger" size="sm">
                      {teamImportPreview.invalidCount} will be skipped
                    </Badge>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <Table
                  columns={[
                    { key: 'status', label: '', width: '70px' },
                    { key: 'team_name', label: 'Team' },
                    { key: 'sport', label: 'Sport' },
                    { key: 'student_id', label: 'Student ID' },
                    { key: 'full_name', label: 'Name' },
                    { key: 'lineup', label: 'Lineup' },
                  ]}
                  data={teamImportPreview.rows.map((r) => ({
                    status: r.valid ? (
                      <Badge variant="success" size="sm">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm" className="whitespace-normal text-left">
                        {r.error}
                      </Badge>
                    ),
                    team_name: r.team_name || '—',
                    sport: r.sport || '—',
                    student_id: r.student_id || '—',
                    full_name: r.full_name || '—',
                    lineup: r.warning ? (
                      <span title={r.warning} className="text-[var(--warning)]">
                        {r.lineup ?? '—'} ⚠
                      </span>
                    ) : (
                      (r.lineup ?? '—')
                    ),
                  }))}
                />
              </div>
            </div>
          )}

          {teamImportResult && (
            <div className="space-y-3">
              {(teamImportResult.created_teams.length > 0 || teamImportResult.added.length > 0) && (
                <Alert type="success">
                  <span className="font-semibold">
                    {teamImportResult.created_teams.length > 0
                      ? `${teamImportResult.created_teams.length} team${teamImportResult.created_teams.length !== 1 ? 's' : ''} created, `
                      : ''}
                    {teamImportResult.added.length} player{teamImportResult.added.length !== 1 ? 's' : ''} added.
                  </span>
                </Alert>
              )}
              {teamImportResult.errors.length > 0 && (
                <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3 space-y-1.5 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {teamImportResult.errors.length} row{teamImportResult.errors.length !== 1 ? 's' : ''}{' '}
                    failed
                  </p>
                  {teamImportResult.errors.map((e, i) => (
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
              disabled={teamImporting}
              onClick={() => {
                setShowTeamImport(false)
                resetTeamImportState()
              }}
            >
              {teamImportResult ? 'Close' : 'Cancel'}
            </Button>
            {!teamImportResult && teamImportPreview && (
              <Button
                loading={teamImporting}
                disabled={teamImportPreviewing || teamImportPreview.validCount === 0}
                icon={<Upload className="w-4 h-4" />}
                onClick={() => void handleConfirmTeamImport()}
              >
                Confirm import ({teamImportPreview.validCount})
              </Button>
            )}
            {teamImportResult &&
              teamImportResult.errors.length > 0 &&
              teamImportResult.added.length === 0 &&
              teamImportResult.created_teams.length === 0 && (
                <Button icon={<Upload className="w-4 h-4" />} onClick={resetTeamImportState}>
                  Try again
                </Button>
              )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editTeam}

        onClose={() => {
          setEditTeam(null)

          setEditError('')

          setEligibleAthletesFetchError('')

          setRosterSuccess('')

          setSelectedRosterMemberIds([])

          setSelectedAthleteIdsToAdd([])

          setBulkRemoveMembershipIds(null)
        }}

        title="Edit Team"

        size="xl"
      >
        {editTeam ? (
          <>
            {editError && (
              <Alert type="danger" className="mb-4">
                {editError}
              </Alert>
            )}

            <div className="space-y-4">
              <Input
                label="Team Name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />

              <Select
                label="Sport"

                value={editForm.sport}

                onChange={(e) => setEditForm((f) => ({ ...f, sport: e.target.value }))}

                options={sportOptionsForForms}
              />

              <Select
                label="Season"

                value={editForm.season_id}

                onChange={(e) => setEditForm((f) => ({ ...f, season_id: e.target.value }))}

                options={seasons.map((s) => ({
                  value: s.id,

                  label: `${s.name}${s.status === 'draft' ? ' — draft' : s.status === 'active' ? ' — active' : s.status === 'completed' ? ' — completed' : s.status === 'archived' ? ' — archived' : ''}`,
                }))}
              />

              <Select
                label="Department"
                value={editForm.department}
                onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                options={[
                  { value: '', label: 'No department' },
                  { value: 'SBMA', label: 'SBMA' },
                  { value: 'SECA', label: 'SECA' },
                  { value: 'SASE', label: 'SASE' },
                  { value: 'SHS', label: 'SHS' },
                ]}
              />

              <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
                {(() => {
                  const members = editTeam?.members ?? []
                  const sport = editTeam.sport
                  const maxRoster = rosterMaxFor(sport)
                  const maxActive = activeSlotsFor(sport)
                  const activeMembers = members
                    .filter((m: any) => m.lineup_slot != null)
                    .sort((a: any, b: any) => a.lineup_slot - b.lineup_slot)
                  const benchMembers = members.filter((m: any) => m.lineup_slot == null)
                  const usedSlots = new Set(activeMembers.map((m: any) => m.lineup_slot as number))
                  const nextFreeSlot =
                    Array.from({ length: maxActive }, (_, i) => i + 1).find(
                      (s) => !usedSlots.has(s),
                    ) ?? null
                  const isFull = members.length >= maxRoster

                  const memberLabel = (m: any) =>
                    m.athlete?.profile?.full_name?.trim() ||
                    m.athlete?.student_id ||
                    m.student_profile?.full_name?.trim() ||
                    m.student_profile?.student_id ||
                    'Member'

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Roster</p>
                        <span className="text-xs text-[var(--text-muted)]">
                          {activeMembers.length}/{maxActive} active · {members.length}/{maxRoster}{' '}
                          total
                          {sport === 'table-tennis' ? (
                            <span className="ml-1 opacity-60">(format set per event)</span>
                          ) : null}
                        </span>
                      </div>

                      {selectedRosterMemberIds.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
                          <span className="text-xs text-[var(--text-muted)]">
                            {selectedRosterMemberIds.length} selected
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={rosterBulkBusy}
                            onClick={() => void bulkBenchSelected()}
                          >
                            Bench
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={rosterBulkBusy}
                            onClick={() => void bulkActivateSelected()}
                          >
                            Activate
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            loading={rosterBulkBusy}
                            onClick={() => setBulkRemoveMembershipIds([...selectedRosterMemberIds])}
                          >
                            Remove
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="ml-auto"
                            onClick={() => setSelectedRosterMemberIds([])}
                          >
                            Clear
                          </Button>
                        </div>
                      ) : null}

                      {isFull ? (
                        <Alert type="warning" className="text-xs">
                          Roster is full ({maxRoster}/{maxRoster}). Remove a player before adding
                          new ones.
                        </Alert>
                      ) : null}

                      {/* Active slots */}
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                          Active
                        </p>
                        {activeMembers.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">
                            No active players yet — promote someone from the bench.
                          </p>
                        ) : null}
                        <ul className="space-y-1.5">
                          {activeMembers.map((m: any) => (
                            <li
                              key={m.id}
                              className="flex items-center gap-2 text-sm rounded-lg bg-[var(--surface-raised)] px-3 py-1.5"
                            >
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 rounded border-[var(--border-subtle)] bg-[var(--surface-base)] accent-[#0066FF]"
                                checked={selectedRosterMemberIds.includes(m.id)}
                                onChange={() => toggleRosterMemberSelect(m.id)}
                                aria-label={`Select ${memberLabel(m)}`}
                              />
                              <span className="w-5 h-5 rounded-full bg-[#0066FF]/20 text-[#4C9FFF] text-xs font-bold flex items-center justify-center shrink-0">
                                {m.lineup_slot}
                              </span>
                              <span className="flex-1 truncate font-medium">{memberLabel(m)}</span>
                              {m.athlete_id ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="w-12 shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-1 text-center text-xs font-mono"
                                  placeholder="##"
                                  maxLength={3}
                                  value={jerseyDrafts[m.athlete_id] ?? m.athlete?.jersey_number ?? ''}
                                  disabled={savingJerseyId === m.athlete_id}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                                    setJerseyDrafts((d) => ({ ...d, [m.athlete_id]: v }))
                                  }}
                                  onBlur={(e) => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                                    if (v !== (m.athlete?.jersey_number ?? ''))
                                      void handleSetJersey(m.athlete_id, v)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  }}
                                  title="Jersey number"
                                  aria-label={`Jersey number for ${memberLabel(m)}`}
                                />
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                loading={savingLineupId === m.id}
                                onClick={() => void handleSetSlot(m.id, null)}
                                title="Move to bench"
                              >
                                → Bench
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                loading={removingMembershipId === m.id}
                                onClick={() =>
                                  setRemoveMemberConfirm({
                                    membershipId: m.id,
                                    label: memberLabel(m),
                                  })
                                }
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Bench */}
                      {benchMembers.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                            Bench
                          </p>
                          <ul className="space-y-1.5">
                            {benchMembers.map((m: any) => (
                              <li
                                key={m.id}
                                className="flex items-center gap-2 text-sm rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 opacity-75"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 shrink-0 rounded border-[var(--border-subtle)] bg-[var(--surface-base)] accent-[#0066FF]"
                                  checked={selectedRosterMemberIds.includes(m.id)}
                                  onChange={() => toggleRosterMemberSelect(m.id)}
                                  aria-label={`Select ${memberLabel(m)}`}
                                />
                                <span className="flex-1 truncate">{memberLabel(m)}</span>
                                {m.student_profile_id || (m.student_profile && !m.athlete) ? (
                                  <Badge size="sm" variant="info">
                                    Tryout
                                  </Badge>
                                ) : null}
                                {m.athlete_id ? (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-12 shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-1 text-center text-xs font-mono"
                                    placeholder="##"
                                    maxLength={3}
                                    value={jerseyDrafts[m.athlete_id] ?? m.athlete?.jersey_number ?? ''}
                                    disabled={savingJerseyId === m.athlete_id}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                                      setJerseyDrafts((d) => ({ ...d, [m.athlete_id]: v }))
                                    }}
                                    onBlur={(e) => {
                                      const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                                      if (v !== (m.athlete?.jersey_number ?? ''))
                                        void handleSetJersey(m.athlete_id, v)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                    }}
                                    title="Jersey number"
                                    aria-label={`Jersey number for ${memberLabel(m)}`}
                                  />
                                ) : null}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  loading={savingLineupId === m.id}
                                  disabled={nextFreeSlot === null}
                                  title={
                                    nextFreeSlot === null
                                      ? `All ${maxActive} active slots are filled`
                                      : `Set as active (slot ${nextFreeSlot})`
                                  }
                                  onClick={() => void handleSetSlot(m.id, nextFreeSlot)}
                                >
                                  → Active
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="danger"
                                  loading={removingMembershipId === m.id}
                                  onClick={() =>
                                    setRemoveMemberConfirm({
                                      membershipId: m.id,
                                      label: memberLabel(m),
                                    })
                                  }
                                >
                                  Remove
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )
                })()}

                <p className="text-sm font-semibold text-[var(--text-primary)] sr-only">
                  Roster (add)
                </p>

                {rosterSuccess ? (
                  <Alert type="success" onDismiss={() => setRosterSuccess('')}>
                    {rosterSuccess}
                  </Alert>
                ) : null}

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Add approved athletes only. People already rostered on another team in this season
                  (same sport) are hidden.
                </p>

                {editForm.sport !== editTeam.sport ? (
                  <p className="text-xs text-[#FFB800]">
                    You changed the sport above — <strong>Save</strong> the team first so the roster
                    list and server stay in sync.
                  </p>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      Approved roster athlete (official)
                    </p>

                    {eligibleAthletesFetchError ? (
                      <Alert type="danger" className="text-sm">
                        {eligibleAthletesFetchError}{' '}
                        <Link
                          to="/organizer/athletes"
                          className="text-[#0066FF] hover:underline font-medium"
                        >
                          Open Athletes
                        </Link>
                      </Alert>
                    ) : null}

                    {eligibleLoading ? (
                      <Skeleton className="h-[5.25rem]" />
                    ) : officialAthletePickRows.length === 0 ? (
                      <Alert type="warning" className="text-sm">
                        {eligibleAthletes.length === 0 ? (
                          <>
                            <strong className="text-[var(--text-secondary)]">
                              No approved athletes for {getSportLabel(editTeam.sport as any)} in the
                              database yet.
                            </strong>{' '}
                            Approve athletes under{' '}
                            <strong className="text-[var(--text-secondary)]">Athletes</strong> (same
                            sport as this team), or run{' '}
                            <strong className="text-[var(--text-secondary)]">
                              pnpm db:seed:dev
                            </strong>{' '}
                            for dev seed accounts. Medical clearance can be completed there before
                            official matches.
                            <div className="mt-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => navigate('/organizer/athletes')}
                              >
                                Open Athletes
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <strong className="text-[var(--text-secondary)]">
                              No athletes left to add — roster limits for this season and sport.
                            </strong>{' '}
                            There are {eligibleAthletes.length} approved{' '}
                            {getSportLabel(editTeam.sport as any)} player(s), but each may only be
                            on one official roster per season for this sport. They&apos;re either
                            already on{' '}
                            <strong className="text-[var(--text-secondary)]">this team</strong> or
                            on{' '}
                            <strong className="text-[var(--text-secondary)]">another team</strong>{' '}
                            for the same season. Remove someone from the other roster or pick
                            another season.
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => navigate('/organizer/athletes')}
                              >
                                Open Athletes
                              </Button>
                            </div>
                          </>
                        )}
                      </Alert>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-[var(--text-muted)]">
                          Select athletes, then add in one action.
                        </p>
                        <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                          {officialAthletePickRows.map((a) => {
                            const label =
                              a.profile?.full_name?.trim() || a.student_id || a.id.slice(0, 8)
                            return (
                              <label
                                key={a.id}
                                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--surface-elevated)] cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 shrink-0 rounded border-[var(--border-subtle)] bg-[var(--surface-base)] accent-[#0066FF]"
                                  checked={selectedAthleteIdsToAdd.includes(a.id)}
                                  onChange={() => toggleAthleteAddSelect(a.id)}
                                />
                                <span className="truncate">{label}</span>
                              </label>
                            )
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            icon={<UserPlus className="w-4 h-4" />}
                            loading={rosterBusy}
                            disabled={
                              selectedAthleteIdsToAdd.length === 0 ||
                              (editTeam?.members ?? []).length >= rosterMaxFor(editTeam.sport)
                            }
                            onClick={() => void addSelectedAthletesBulk()}
                          >
                            Add selected
                            {selectedAthleteIdsToAdd.length
                              ? ` (${selectedAthleteIdsToAdd.length})`
                              : ''}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedAthleteIdsToAdd([])}
                            disabled={selectedAthleteIdsToAdd.length === 0}
                          >
                            Clear selection
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"

                  variant="secondary"

                  className="flex-1"

                  onClick={() => {
                    setEditTeam(null)

                    setEditError('')

                    setEligibleAthletesFetchError('')

                    setRosterSuccess('')

                    setSelectedRosterMemberIds([])

                    setSelectedAthleteIdsToAdd([])

                    setBulkRemoveMembershipIds(null)
                  }}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  className="flex-1"
                  loading={savingEdit}
                  onClick={() => void handleUpdate()}
                >
                  Save
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={!!bulkRemoveMembershipIds?.length}

        onClose={() => {
          if (!rosterBulkBusy) setBulkRemoveMembershipIds(null)
        }}

        title="Remove players"

        size="md"
      >
        {bulkRemoveMembershipIds && bulkRemoveMembershipIds.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Remove{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {bulkRemoveMembershipIds.length}
              </span>{' '}
              players from this roster?
            </p>

            {editError ? <Alert type="danger">{editError}</Alert> : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={rosterBulkBusy}
                onClick={() => setBulkRemoveMembershipIds(null)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="danger"
                className="flex-1"
                loading={rosterBulkBusy}
                onClick={() => void executeBulkRemoveMembers()}
              >
                Remove all
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!removeMemberConfirm}

        onClose={() => {
          if (!removingMembershipId) {
            setRemoveMemberConfirm(null)

            setEditError('')
          }
        }}

        title="Remove player"

        size="md"
      >
        {removeMemberConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Remove{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {removeMemberConfirm.label}
              </span>{' '}
              from this team roster? Line-up slots update immediately; you can add them again later
              if roster space allows.
            </p>

            {editError ? <Alert type="danger">{editError}</Alert> : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={!!removingMembershipId}
                onClick={() => setRemoveMemberConfirm(null)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="danger"
                className="flex-1"
                loading={!!removingMembershipId}
                onClick={() => void removeMember(removeMemberConfirm.membershipId)}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!coachLeaveConfirm}

        onClose={() => {
          if (!coachBusy) {
            setCoachLeaveConfirm(null)

            setListError('')
          }
        }}

        title="Leave coaching role"

        size="md"
      >
        {coachLeaveConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Stop coaching{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {coachLeaveConfirm.teamName}
              </span>
              ? Another organizer can assign themselves as coach afterward.
            </p>

            {listError ? <Alert type="danger">{listError}</Alert> : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={coachBusy}
                onClick={() => setCoachLeaveConfirm(null)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="danger"
                className="flex-1"
                loading={coachBusy}
                onClick={() => void confirmLeaveCoachRole()}
              >
                Leave role
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}

        onClose={() => {
          setDeleteTarget(null)

          setDeleteError('')
        }}

        title="Delete team"
      >
        {deleteTarget && (
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Delete{' '}
            <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.name}</span>?
            This cannot be undone. Teams registered on an event must be removed from the event
            first.
          </p>
        )}

        {deleteError && (
          <Alert type="danger" className="mb-4">
            {deleteError}
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="danger"
            className="flex-1"
            loading={deleting}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
