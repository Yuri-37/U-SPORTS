import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import {
  Play,
  Users,
  Trophy,
  Shuffle,
  Tv2,
  Calendar,
  Trash2,
  Ban,
  Pencil,
  FileText,
} from 'lucide-react'
import {
  Button,
  Card,
  Badge,
  Modal,
  Select,
  Alert,
  TabBar,
  Table,
  Input,
  Textarea,
  Skeleton,
} from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { Event, Match, Bracket, Team } from '../../types'
import {
  getSportLabel,
  formatDateTime,
  formatEnumLabel,
  organizerEventStatusLabel,
} from '../../lib/utils'
import { collectBracketParticipantIds, fetchParticipantLabels } from '../../lib/participantLabels'
import BracketView from '../../components/brackets/BracketView'
import EventPodiumStrip from '../../components/events/EventPodiumStrip'
import { deriveEliminationPodium } from '../../lib/eventPlacements'
import { useOrganizerSportScope } from '../../hooks/useOrganizerSportScope'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'

const STATUS_VARIANTS: Record<string, any> = {
  draft: 'default',
  registration: 'info',
  in_progress: 'danger',
  completed: 'success',
  cancelled: 'default',
}

export default function OrganizerEventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canConfigureSport } = useOrganizerSportScope()
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const isCoach = scopedProfile?.role === 'Coach'

  const openMatchWorkspace = (m: Match) => {
    if (m.status === 'completed') navigate(`/organizer/match-review/${m.id}`)
    else if (!isCoach && !lockedMatchIds.has(m.id)) navigate(`/organizer/scoring/${m.id}`)
  }
  const [event, setEvent] = useState<(Event & { participants: any[] }) | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [brackets, setBrackets] = useState<Bracket[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('bracket')
  const [generatingBracket, setGeneratingBracket] = useState(false)
  const [addingParticipants, setAddingParticipants] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [crossoverPick, setCrossoverPick] = useState<Record<string, { a: string; b: string }>>({})
  const [savingCrossover, setSavingCrossover] = useState(false)
  const [participantLabels, setParticipantLabels] = useState<Record<string, string>>({})
  const [finishOpen, setFinishOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [destructiveLoading, setDestructiveLoading] = useState(false)
  const [editDetailsOpen, setEditDetailsOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTTFormat, setEditTTFormat] = useState<'singles' | 'doubles'>('singles')
  const [savingDetails, setSavingDetails] = useState(false)
  const [scheduleMatch, setScheduleMatch] = useState<Match | null>(null)
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [schedVenue, setSchedVenue] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [removeParticipantConfirm, setRemoveParticipantConfirm] = useState<{
    participant_id: string
    name: string
  } | null>(null)
  const [removingParticipant, setRemovingParticipant] = useState(false)
  const [bracketGenConfirm, setBracketGenConfirm] = useState<null | 'generate' | 'regenerate'>(null)
  const confirmRemoveParticipant = async () => {
    if (!removeParticipantConfirm || !id) return
    setRemovingParticipant(true)
    setError('')
    try {
      await api.delete(`/events/${id}/participants/${removeParticipantConfirm.participant_id}`)
      setRemoveParticipantConfirm(null)
      await fetchAll()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not remove team')
    } finally {
      setRemovingParticipant(false)
    }
  }

  const runGenerateBracketConfirmed = async () => {
    if (!event || !id) return
    setGeneratingBracket(true)
    setError('')
    try {
      const participantIds = event.participants.map((p: any) => p.participant_id)
      await api.post(`/brackets/${id}/generate`, { participantIds })
      setBracketGenConfirm(null)
      await fetchAll()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Bracket generation failed')
      setBracketGenConfirm(null)
    } finally {
      setGeneratingBracket(false)
    }
  }

  const fetchAll = async () => {
    const [evRes, mRes, bRes] = await Promise.all([
      api.get(`/events/${id}`),
      api.get(`/events/${id}/matches`),
      api.get(`/brackets/${id}`),
    ])
    setEvent(evRes.data)
    setMatches(mRes.data)
    setBrackets(bRes.data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    supabase
      .from('teams')
      .select('*')
      .then((r) => setTeams(r.data ?? []))
  }, [id])

  useEffect(() => {
    if (!editDetailsOpen || !event) return
    setEditName(event.name)
    setEditDescription(event.description ?? '')
  }, [editDetailsOpen, event])

  const crossoverSemis = useMemo(
    () =>
      [...matches]
        .filter((m) =>
          brackets.some((b) => b.id === m.bracket_id && b.bracket_type === 'crossover_semi'),
        )
        .sort((a, b) => {
          const ba = brackets.find((bk) => bk.id === a.bracket_id)
          const bb = brackets.find((bk) => bk.id === b.bracket_id)
          return (ba?.match_order ?? 0) - (bb?.match_order ?? 0)
        }),
    [matches, brackets],
  )

  const eliminationPodium = useMemo(() => deriveEliminationPodium(brackets), [brackets])

  const lockedMatchIds = useMemo(() => {
    const locked = new Set<string>()
    const bracketToMatch = new Map<string, Match>()
    for (const m of matches) {
      if (m.bracket_id) bracketToMatch.set(m.bracket_id, m)
    }
    const byRound = new Map<number, Bracket[]>()
    for (const b of brackets) {
      const arr = byRound.get(b.round) ?? []
      arr.push(b)
      byRound.set(b.round, arr)
    }
    for (const [, roundBrackets] of byRound) {
      const sorted = roundBrackets.slice().sort((a, b) => a.match_order - b.match_order)
      for (let i = 0; i < sorted.length; i++) {
        const b = sorted[i]
        if (b.is_bye || !b.participant_a_id || !b.participant_b_id) continue
        const hasEarlierIncomplete = sorted.slice(0, i).some((earlier) => {
          if (earlier.is_bye || !earlier.participant_a_id || !earlier.participant_b_id) return false
          const m = bracketToMatch.get(earlier.id)
          return !m || (m.status !== 'completed' && m.status !== 'cancelled')
        })
        if (hasEarlierIncomplete) {
          const m = bracketToMatch.get(b.id)
          if (m) locked.add(m.id)
        }
      }
    }
    return locked
  }, [matches, brackets])

  useEffect(() => {
    const next: Record<string, { a: string; b: string }> = {}
    for (const m of crossoverSemis) {
      next[m.id] = { a: m.participant_a_id ?? '', b: m.participant_b_id ?? '' }
    }
    setCrossoverPick(next)
  }, [crossoverSemis])

  useEffect(() => {
    // Collect IDs from both brackets and matches so the Matches tab also gets team names
    const bracketIds = collectBracketParticipantIds(brackets)
    const matchIds = matches.flatMap((m) =>
      [m.participant_a_id, m.participant_b_id].filter((x): x is string => !!x),
    )
    const ids = [...new Set([...bracketIds, ...matchIds])]
    if (ids.length === 0) {
      setParticipantLabels({})
      return
    }
    const fromTeams: Record<string, string> = {}
    for (const t of teams) fromTeams[t.id] = t.name as string
    const missing = ids.filter((id) => !fromTeams[id])
    if (missing.length === 0) {
      setParticipantLabels(fromTeams)
      return
    }
    let cancelled = false
    void fetchParticipantLabels(missing).then((extra) => {
      if (!cancelled) setParticipantLabels({ ...fromTeams, ...extra })
    })
    return () => {
      cancelled = true
    }
  }, [teams, brackets, matches])

  const handleSaveCrossover = async () => {
    setSavingCrossover(true)
    setError('')
    try {
      for (const m of crossoverSemis) {
        const pick = crossoverPick[m.id] ?? { a: '', b: '' }
        await api.patch(`/brackets/matches/${m.id}/participants`, {
          participant_a_id: pick.a ? pick.a : null,
          participant_b_id: pick.b ? pick.b : null,
        })
      }
      await fetchAll()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not save crossover teams')
    } finally {
      setSavingCrossover(false)
    }
  }

  const handleAddParticipants = async () => {
    if (selectedTeamIds.size === 0) return
    setAddingParticipants(true)
    setError('')
    try {
      await api.post(`/events/${id}/participants/bulk`, {
        participant_ids: [...selectedTeamIds],
        participant_type: 'team',
      })
      setSelectedTeamIds(new Set())
      fetchAll()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to add participants')
    } finally {
      setAddingParticipants(false)
    }
  }

  const toggleTeamSelect = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  const handleStatusChange = async (newStatus: string) => {
    setError('')
    try {
      await api.patch(`/events/${id}/status`, { newStatus })
      await fetchAll()
      return true
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not update status')
      return false
    }
  }

  const confirmFinish = async () => {
    setDestructiveLoading(true)
    try {
      const ok = await handleStatusChange('completed')
      if (ok) setFinishOpen(false)
    } finally {
      setDestructiveLoading(false)
    }
  }

  const confirmCancel = async () => {
    setDestructiveLoading(true)
    try {
      const ok = await handleStatusChange('cancelled')
      if (ok) setCancelOpen(false)
    } finally {
      setDestructiveLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (!id) return
    setDestructiveLoading(true)
    setError('')
    try {
      await api.delete(`/events/${id}`)
      navigate('/organizer/events')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not delete event')
      setDeleteOpen(false)
    } finally {
      setDestructiveLoading(false)
    }
  }

  const handleSaveEventDetails = async () => {
    if (!id) return
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Enter an event name.')
      return
    }
    setSavingDetails(true)
    setError('')
    try {
      await api.patch(`/events/${id}`, {
        name: trimmed,
        description: editDescription.trim() === '' ? null : editDescription.trim(),
        ...(event?.sport === 'table-tennis' ? { table_tennis_format: editTTFormat } : {}),
      })
      setEditDetailsOpen(false)
      await fetchAll()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not update event')
    } finally {
      setSavingDetails(false)
    }
  }

  const openScheduleEditor = (m: Match) => {
    setScheduleMatch(m)
    if (m.scheduled_at) {
      const d = new Date(m.scheduled_at)
      setSchedDate(d.toISOString().slice(0, 10))
      setSchedTime(d.toTimeString().slice(0, 5))
    } else {
      setSchedDate('')
      setSchedTime('')
    }
    setSchedVenue(m.venue ?? '')
  }

  const handleSaveSchedule = async () => {
    if (!scheduleMatch || !id) return
    setSavingSchedule(true)
    setError('')
    try {
      const scheduled_at =
        schedDate && schedTime
          ? new Date(`${schedDate}T${schedTime}`).toISOString()
          : schedDate
            ? new Date(`${schedDate}T00:00`).toISOString()
            : null
      await api.patch(`/events/${id}/matches/${scheduleMatch.id}/schedule`, {
        scheduled_at,
        venue: schedVenue.trim() || null,
      })
      setScheduleMatch(null)
      await fetchAll()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not update schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  if (loading)
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (!event)
    return <div className="text-center py-12 text-[var(--text-muted)]">Event not found</div>

  const readOnlyEvent = isCoach || !canConfigureSport(event.sport)

  const availableTeams = teams.filter(
    (t: Team) =>
      t.sport === event.sport &&
      t.season_id === event.season_id &&
      !event.participants?.some((p: any) => p.participant_id === t.id),
  )

  const eventTeamSelectOptions =
    (event.participants ?? [])
      .filter((p: { participant_type?: string }) => (p.participant_type ?? 'team') === 'team')
      .map((p: { participant_id: string }) => ({
        label: teams.find((t) => t.id === p.participant_id)?.name ?? p.participant_id.slice(0, 8),
        value: p.participant_id,
      })) ?? []

  const hasSplitPools = brackets.some(
    (b) => b.bracket_type === 'rr_pool_a' || b.bracket_type === 'rr_pool_b',
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      {readOnlyEvent && (
        <Alert type="info">
          {isCoach
            ? `Coaches can view brackets and matches but cannot edit events or score matches. Manage your team's roster and lineups from the Teams page.`
            : `View-only for this sport: your organizer account cannot edit ${getSportLabel(event.sport as any)} events. Browse bracket and matches or open scoring; use another organizer account with this sport assigned to make changes.`}
        </Alert>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={() => navigate('/organizer/events')}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-2 flex items-center gap-1"
          >
            ← Back to Events
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{event.name}</h1>
            {!readOnlyEvent ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Pencil className="w-3 h-3" />}
                onClick={() => {
                  setEditName(event.name)
                  setEditDescription(event.description ?? '')
                  setEditTTFormat(
                    (event as any).table_tennis_format === 'doubles' ? 'doubles' : 'singles',
                  )
                  setEditDetailsOpen(true)
                }}
              >
                Edit details
              </Button>
            ) : (
              <Badge size="sm" variant="default">
                View only
              </Badge>
            )}
          </div>
          <p className="text-[var(--text-muted)] text-sm">
            {getSportLabel(event.sport as any)} · {formatEnumLabel(event.format)}
            {event.sport === 'table-tennis' && (event as any).table_tennis_format
              ? ` · ${(event as any).table_tennis_format}`
              : ''}
          </p>
          {event.sport === 'table-tennis' && (event as any).table_tennis_format && (
            <Badge className="mt-1 ml-2" variant="default" size="sm">
              {(event as any).table_tennis_format === 'doubles' ? '🏓🏓 Doubles' : '🏓 Singles'}
            </Badge>
          )}
          {event.description ? (
            <p className="text-sm text-[var(--text-secondary)] mt-3 whitespace-pre-wrap">
              {event.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          {!readOnlyEvent ? (
            <>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Badge variant={STATUS_VARIANTS[event.status]}>
                  {organizerEventStatusLabel(event.status)}
                </Badge>
                {event.status === 'draft' && (
                  <Button
                    size="sm"
                    icon={<Calendar className="w-3 h-3" />}
                    onClick={() => void handleStatusChange('registration')}
                  >
                    Publish to hub
                  </Button>
                )}
                {event.status === 'registration' && (
                  <Button
                    size="sm"
                    icon={<Play className="w-3 h-3" />}
                    onClick={() => void handleStatusChange('in_progress')}
                  >
                    Start event
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {event.status === 'in_progress' && (
                  <Button size="sm" variant="success" onClick={() => setFinishOpen(true)}>
                    Mark finished
                  </Button>
                )}
                {['draft', 'registration', 'in_progress'].includes(event.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Ban className="w-3 h-3" />}
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel event
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="w-3 h-3" />}
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <Badge variant={STATUS_VARIANTS[event.status]}>
              {organizerEventStatusLabel(event.status)}
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <Alert type="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Modal open={editDetailsOpen} onClose={() => setEditDetailsOpen(false)} title="Edit event">
        <div className="space-y-4">
          <Input
            label="Event name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Spring tournament"
          />
          <Textarea
            label="Description (optional)"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Shown on public event pages."
            rows={4}
          />
          {event?.sport === 'table-tennis' && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Table Tennis Format
              </p>
              <div className="flex gap-2">
                {(['singles', 'doubles'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setEditTTFormat(fmt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${editTTFormat === fmt ? 'bg-[var(--accent-default)] border-[var(--accent-default)] text-white' : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  >
                    {fmt === 'singles' ? '🏓 Singles (1 vs 1)' : '🏓🏓 Doubles (2 vs 2)'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditDetailsOpen(false)}>
              Cancel
            </Button>
            <Button loading={savingDetails} onClick={() => void handleSaveEventDetails()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <TabBar
        tabs={[
          { id: 'bracket', label: 'Bracket', icon: <Trophy className="w-3.5 h-3.5" /> },
          {
            id: 'matches',
            label: `Matches (${matches.length})`,
            icon: <Calendar className="w-3.5 h-3.5" />,
          },
          {
            id: 'participants',
            label: `Teams (${event.participants?.length ?? 0})`,
            icon: <Users className="w-3.5 h-3.5" />,
          },
        ]}
        active={tab}
        onChange={setTab}
      />

      {event.status === 'completed' && eliminationPodium && eliminationPodium.length > 0 ? (
        <EventPodiumStrip
          placements={eliminationPodium}
          labelByParticipantId={participantLabels}
          title="Final standings"
        />
      ) : null}

      {tab === 'bracket' && (
        <div>
          {brackets.length === 0 ? (
            <Card className="text-center py-12">
              <Trophy className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
              <p className="font-bold mb-2">No bracket generated yet</p>
              <p className="text-[var(--text-muted)] text-sm mb-4">
                Add participants first, then generate the bracket.
              </p>
              <Button
                icon={<Shuffle className="w-4 h-4" />}
                loading={generatingBracket}
                onClick={() => setBracketGenConfirm('generate')}
                disabled={readOnlyEvent || (event.participants?.length ?? 0) < 2}
              >
                Generate Bracket
              </Button>
            </Card>
          ) : (
            <div>
              {hasSplitPools && (
                <Alert type="info" className="mb-4">
                  This event uses <strong>two round-robin pools</strong> (more than 10 teams), then{' '}
                  <strong>crossover semifinals</strong> and a final. Finish pool play, then assign
                  semifinal teams below (commonly 1st Pool A vs 2nd Pool B, and 1st Pool B vs 2nd
                  Pool A). Winners advance to the final automatically when you complete each semi.
                </Alert>
              )}
              {crossoverSemis.length > 0 && (
                <Card className="p-4 mb-4">
                  <h3 className="font-semibold mb-1">Crossover semifinals — assign teams</h3>
                  <p className="text-xs text-[var(--text-muted)] mb-4">
                    Teams must be participants in this event. The final fills when both semifinal
                    winners are decided.
                  </p>
                  <div className="space-y-4">
                    {crossoverSemis.map((m, idx) => (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap"
                      >
                        <p className="text-sm text-[var(--text-secondary)] w-full sm:w-auto sm:min-w-[7rem] pt-1">
                          Semi {idx + 1}
                        </p>
                        <Select
                          label="Side A"
                          className="flex-1 min-w-[10rem]"
                          disabled={readOnlyEvent}
                          value={crossoverPick[m.id]?.a ?? ''}
                          onChange={(e) =>
                            setCrossoverPick((prev) => ({
                              ...prev,
                              [m.id]: { a: e.target.value, b: prev[m.id]?.b ?? '' },
                            }))
                          }
                          options={[
                            { value: '', label: 'Select team…' },
                            ...eventTeamSelectOptions.map((o) => ({
                              value: o.value,
                              label: o.label,
                            })),
                          ]}
                        />
                        <Select
                          label="Side B"
                          className="flex-1 min-w-[10rem]"
                          disabled={readOnlyEvent}
                          value={crossoverPick[m.id]?.b ?? ''}
                          onChange={(e) =>
                            setCrossoverPick((prev) => ({
                              ...prev,
                              [m.id]: { a: prev[m.id]?.a ?? '', b: e.target.value },
                            }))
                          }
                          options={[
                            { value: '', label: 'Select team…' },
                            ...eventTeamSelectOptions.map((o) => ({
                              value: o.value,
                              label: o.label,
                            })),
                          ]}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    className="mt-4"
                    loading={savingCrossover}
                    disabled={readOnlyEvent}
                    onClick={() => void handleSaveCrossover()}
                  >
                    Save crossover matchups
                  </Button>
                </Card>
              )}
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-[var(--text-muted)]">
                  {brackets.length} slots · {matches.length} matches
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Shuffle className="w-3.5 h-3.5" />}
                  loading={generatingBracket}
                  disabled={readOnlyEvent}
                  onClick={() => setBracketGenConfirm('regenerate')}
                >
                  Regenerate
                </Button>
              </div>
              <BracketView
                brackets={brackets}
                matches={matches}
                participantLabels={participantLabels}
                onMatchClick={openMatchWorkspace}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'matches' && (
        <Table
          columns={[
            { key: 'teams', label: 'Match' },
            { key: 'status', label: 'Status' },
            { key: 'scheduled', label: 'Scheduled' },
            { key: 'actions', label: '' },
          ]}
          onRowClick={(_, rowIndex) => {
            const m = matches[rowIndex]
            if (m) openMatchWorkspace(m)
          }}
          data={matches.map((m) => {
            const bracket = brackets.find((b) => b.id === m.bracket_id)
            const labelA = m.participant_a_id
              ? (participantLabels[m.participant_a_id] ??
                teams.find((t) => t.id === m.participant_a_id)?.name ??
                `Team ${m.participant_a_id.slice(0, 6)}`)
              : 'TBD'
            const labelB = m.participant_b_id
              ? (participantLabels[m.participant_b_id] ??
                teams.find((t) => t.id === m.participant_b_id)?.name ??
                `Team ${m.participant_b_id.slice(0, 6)}`)
              : 'TBD'
            const roundLabel = bracket ? `Round ${bracket.round}` : ''
            const canScore = event?.status === 'in_progress'
            return {
              teams: (
                <div>
                  <p className="text-sm font-medium">
                    {labelA} <span className="text-[var(--text-muted)] font-normal">vs</span>{' '}
                    {labelB}
                  </p>
                  {roundLabel && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{roundLabel}</p>
                  )}
                </div>
              ),
              status: (
                <Badge
                  variant={
                    m.status === 'live'
                      ? 'danger'
                      : m.status === 'completed'
                        ? 'success'
                        : 'default'
                  }
                  size="sm"
                >
                  {m.status === 'live' ? '● LIVE' : formatEnumLabel(m.status)}
                </Badge>
              ),
              scheduled: (
                <div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {m.scheduled_at ? formatDateTime(m.scheduled_at) : 'Not set'}
                  </span>
                  {m.venue && <p className="text-xs text-[var(--text-muted)] mt-0.5">{m.venue}</p>}
                </div>
              ),
              actions: (
                <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {m.status !== 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Calendar className="w-3 h-3" />}
                      disabled={readOnlyEvent}
                      onClick={() => openScheduleEditor(m)}
                    >
                      Schedule
                    </Button>
                  )}
                  {m.status !== 'completed' &&
                    canScore &&
                    !isCoach &&
                    (lockedMatchIds.has(m.id) ? (
                      <span
                        className="text-xs text-[var(--text-muted)] self-center"
                        title="Complete earlier matches in this round first"
                      >
                        🔒 Earlier match first
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        icon={<Play className="w-3 h-3" />}
                        onClick={() => navigate(`/organizer/scoring/${m.id}`)}
                      >
                        {m.status === 'live' ? 'Resume' : 'Score'}
                      </Button>
                    ))}
                  {m.status !== 'completed' && !canScore && (
                    <span className="text-xs text-[var(--text-muted)] self-center">
                      Start event to score
                    </span>
                  )}
                  {m.status === 'completed' && m.finalized_at && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FileText className="w-3 h-3" />}
                      onClick={() => navigate(`/organizer/match-review/${m.id}/score-sheet`)}
                    >
                      Score Sheet
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Tv2 className="w-3 h-3" />}
                    onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}
                  >
                    Jumbotron
                  </Button>
                </div>
              ),
            }
          })}
          emptyMessage="No matches yet. Generate bracket to create matches."
        />
      )}

      {tab === 'participants' && (
        <div className="space-y-4">
          {/* Add participants */}
          {!readOnlyEvent && (
            <Card>
              <h3 className="font-semibold mb-3">Add Teams</h3>
              {availableTeams.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No more teams available — all eligible teams for this sport and season are already
                  added, or none exist yet.
                </p>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] mb-3">
                    {availableTeams.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-[var(--surface-elevated)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 rounded border-[var(--border-subtle)] bg-[var(--surface-base)] accent-[#0066FF]"
                          checked={selectedTeamIds.has(t.id)}
                          onChange={() => toggleTeamSelect(t.id)}
                        />
                        <span className="truncate font-medium">{t.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      loading={addingParticipants}
                      disabled={selectedTeamIds.size === 0}
                      onClick={() => void handleAddParticipants()}
                    >
                      Add selected{selectedTeamIds.size > 0 ? ` (${selectedTeamIds.size})` : ''}
                    </Button>
                    {selectedTeamIds.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTeamIds(new Set())}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          )}

          {(event.participants ?? []).length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-8">No participants yet</p>
          ) : (
            <div className="space-y-2">
              {event.participants.map((p: any, i: number) => {
                const team = teams.find((t) => t.id === p.participant_id)
                return (
                  <Card key={p.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                        {p.seed ?? i + 1}
                      </span>
                      <span className="font-medium">
                        {team?.name ?? p.participant_id.slice(0, 8)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={readOnlyEvent}
                      onClick={() =>
                        setRemoveParticipantConfirm({
                          participant_id: p.participant_id,
                          name: team?.name ?? p.participant_id.slice(0, 8),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Modal
        open={removeParticipantConfirm !== null}
        onClose={() => !removingParticipant && setRemoveParticipantConfirm(null)}
        title="Remove team from event?"
        size="md"
      >
        {removeParticipantConfirm && (
          <div className="space-y-4">
            <Alert type="warning">
              Remove <strong>{removeParticipantConfirm.name}</strong> from this event&apos;s
              participants? Bracket or seeding may need to be updated afterward.
            </Alert>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setRemoveParticipantConfirm(null)}
                disabled={removingParticipant}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={removingParticipant}
                onClick={() => void confirmRemoveParticipant()}
              >
                Remove team
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={bracketGenConfirm !== null}
        onClose={() => !generatingBracket && setBracketGenConfirm(null)}
        title={bracketGenConfirm === 'regenerate' ? 'Regenerate bracket?' : 'Generate bracket?'}
        size="md"
      >
        <div className="space-y-4">
          <Alert type="warning">
            {bracketGenConfirm === 'regenerate'
              ? 'Regenerating replaces the current bracket and matches. Scheduled times may be lost. Continue only if you intend to rebuild the tournament structure.'
              : 'Create the bracket and matches from the current participant list? You can regenerate later if participants change.'}
          </Alert>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setBracketGenConfirm(null)}
              disabled={generatingBracket}
            >
              Cancel
            </Button>
            <Button loading={generatingBracket} onClick={() => void runGenerateBracketConfirmed()}>
              {bracketGenConfirm === 'regenerate' ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Mark event finished?"
        size="md"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          This marks the tournament as finished. It will disappear from the guest hub and the public
          events list; guests can still open a saved link to this page if they have it.
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" onClick={() => setFinishOpen(false)}>
            Back
          </Button>
          <Button loading={destructiveLoading} onClick={() => void confirmFinish()}>
            Mark finished
          </Button>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this event?"
        size="md"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Cancelled events are hidden from the guest hub and public events list. You can still see
          them under Events → Cancelled.
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>
            Back
          </Button>
          <Button
            variant="danger"
            loading={destructiveLoading}
            onClick={() => void confirmCancel()}
          >
            Cancel event
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete event permanently?"
        size="md"
      >
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          This removes the event, bracket, matches, and scores from the database. This cannot be
          undone.
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Back
          </Button>
          <Button
            variant="danger"
            loading={destructiveLoading}
            onClick={() => void confirmDelete()}
          >
            Delete permanently
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!scheduleMatch}
        onClose={() => setScheduleMatch(null)}
        title="Schedule Match"
        size="md"
      >
        {scheduleMatch && (
          <div className="space-y-4">
            <Input
              label="Date"
              type="date"
              value={schedDate}
              onChange={(e) => setSchedDate(e.target.value)}
            />
            <Input
              label="Time"
              type="time"
              value={schedTime}
              onChange={(e) => setSchedTime(e.target.value)}
            />
            <Input
              label="Venue (optional)"
              value={schedVenue}
              onChange={(e) => setSchedVenue(e.target.value)}
              placeholder="e.g. Main Gymnasium"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setScheduleMatch(null)}>
                Cancel
              </Button>
              <Button loading={savingSchedule} onClick={() => void handleSaveSchedule()}>
                Save Schedule
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
