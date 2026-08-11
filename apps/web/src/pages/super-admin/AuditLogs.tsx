import React, { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Table, Badge, Input, Select, Button } from '../../components/ui'
import api from '../../lib/api'
import type { AuditLog } from '../../types'
import { formatDateTime } from '../../lib/utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Friendlier labels for the raw *_id keys every writeAuditLog() call site stores. */
const KEY_LABELS: Record<string, string> = {
  event_id: 'Event',
  season_id: 'Season',
  team_id: 'Team',
  athlete_id: 'Athlete',
  winner_id: 'Winner',
  participant_id: 'Participant',
  participant_a_id: 'Participant A',
  participant_b_id: 'Participant B',
  out_athlete_id: 'Athlete (out)',
  in_athlete_id: 'Athlete (in)',
  organizer_id: 'Organizer',
  previous_holder_id: 'Previous holder',
  bracket_id: 'Bracket',
  undone_action_id: 'Action undone',
}

// Acronyms that should stay uppercase after title-casing an action/entity slug.
const ACRONYMS = ['Pdf', 'Csv', 'Xlsx', 'Ot']

function titleCase(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(new RegExp(`\\b(${ACRONYMS.join('|')})\\b`, 'g'), (m) => m.toUpperCase())
}

function humanizeKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  return titleCase(key.replace(/_id$/, ''))
}

/** Every distinct entity_type any writeAuditLog() call site uses today. */
const ENTITY_TYPES = [
  'team',
  'team_member',
  'team_coach',
  'event',
  'event_participant',
  'match',
  'season',
  'athlete',
  'staff',
  'profile',
  'announcement',
  'institution',
]

/** Every distinct action string any writeAuditLog() call site (or direct insert) uses today. */
const ACTIONS = [
  'team_created',
  'team_updated',
  'team_deleted',
  'team_member_added',
  'team_member_removed',
  'team_members_bulk_removed',
  'team_coach_assigned',
  'team_coach_removed',
  'team_lineup_updated',
  'teams_imported',
  'event_created',
  'event_updated',
  'event_deleted',
  'event_status_changed',
  'event_participant_added',
  'event_participants_bulk_added',
  'event_participant_removed',
  'match_schedule_updated',
  'match_started',
  'match_period_changed',
  'match_period_validated',
  'match_period_unlocked',
  'match_first_server_set',
  'match_ended',
  'match_stats_finalized',
  'match_player_stats_updated',
  'match_live_lineup_swapped',
  'match_score_sheet_pdf_exported',
  'clock_lock_transferred',
  'scoring_lock_transferred',
  'scoring_action_undone',
  'bracket_generated',
  'bracket_winner_advanced',
  'bracket_match_participants_updated',
  'analytics_csv_exported',
  'analytics_insights_xlsx_exported',
  'season_pdf_report_exported',
  'insights_season_backfill',
  'password_changed',
  'privacy_notice_accepted',
  'announcement_created',
  'announcement_updated',
  'announcement_deleted',
  'season_created',
  'season_draft',
  'season_active',
  'season_completed',
  'season_archived',
  'season_deleted',
  'staff_created',
  'staff_updated',
  'organizer_activated',
  'organizer_deactivated',
  'organizer_password_reset',
  'admin_created',
  'player_season_stats_recomputed',
  'athlete_roster_details_updated',
  'athlete_password_reset',
  'athlete_season_status_active',
  'athlete_season_status_inactive',
  'athletes_imported',
]

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All entity types' },
  ...ENTITY_TYPES.map((t) => ({ value: t, label: titleCase(t) })),
]
const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  ...ACTIONS.map((a) => ({ value: a, label: titleCase(a) })),
]

/** A resolved name when we have one for this id, else null. */
function resolveLabel(value: string, labels: Record<string, string>): string | null {
  if (labels[value]) return labels[value]
  if (UUID_RE.test(value)) return null
  return value
}

function formatDetailValue(value: unknown, labels: Record<string, string>): string {
  if (typeof value === 'string') return resolveLabel(value, labels) ?? `${value.slice(0, 8)}…${value.slice(-4)}`
  if (Array.isArray(value)) return value.map((v) => formatDetailValue(v, labels)).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * The entity column never shows a raw/truncated UUID — that's the whole point of this
 * function. Preference order: a server-resolved name (`labels`, looked up from the still-
 * live row); failing that, a name captured in `details` at write time (every *_deleted
 * action now stores `name`/`title` before its row disappears, same as *_created actions
 * already did); failing that, a plain "<Entity type> (unavailable)" — still readable,
 * never hex. The full id stays in the `title` tooltip for anyone who needs to look it up.
 */
function formatEntityId(
  id: string | null,
  entityType: string,
  labels: Record<string, string>,
  details: unknown,
): string {
  if (!id) return '—'
  if (labels[id]) return labels[id]
  const d = details && typeof details === 'object' ? (details as Record<string, unknown>) : null
  const detailName =
    typeof d?.name === 'string' && d.name
      ? d.name
      : typeof d?.title === 'string' && d.title
        ? d.title
        : null
  if (detailName) return detailName
  return `${titleCase(entityType)} (unavailable)`
}

type StatChange = { from: number; to: number }

/**
 * Renders the `details` payload. Stat corrections carry a `changed` map of
 * before/after values plus the organizer's stated reason; showing them is the
 * whole point of auditing an edit. Every other key is whatever raw data the
 * writing route passed (often bare ids) — `labels` (resolved server-side in
 * one batch, see GET /admin/audit) swaps those for names instead of UUIDs.
 */
function AuditDetails({ details, labels }: { details: unknown; labels: Record<string, string> }) {
  if (!details || typeof details !== 'object')
    return <span className="text-[var(--text-muted)]">—</span>
  const d = details as Record<string, unknown>
  const changed = d.changed as Record<string, StatChange> | undefined
  const reason = typeof d.reason === 'string' ? d.reason : null

  const otherKeys = Object.keys(d).filter((k) => k !== 'changed' && k !== 'reason')

  if (!changed && !reason && otherKeys.length === 0) {
    return <span className="text-[var(--text-muted)]">—</span>
  }

  return (
    <div className="flex flex-col gap-1 text-xs max-w-md">
      {reason && <p className="italic text-[var(--text-secondary)]">"{reason}"</p>}
      {changed && Object.keys(changed).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(changed).map(([key, v]) => (
            <span
              key={key}
              className="font-mono bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded"
            >
              {key}: <span className="text-[var(--text-muted)]">{v.from}</span> →{' '}
              <span className="font-bold">{v.to}</span>
            </span>
          ))}
        </div>
      )}
      {otherKeys.length > 0 && (
        <span className="text-[var(--text-secondary)]">
          {otherKeys
            .map((k) => `${humanizeKey(k)}: ${formatDetailValue(d[k], labels)}`)
            .join(' · ')}
        </span>
      )}
    </div>
  )
}

export default function SuperAdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')

  // Debounce the search box so every keystroke doesn't fire a request — filters
  // are server-side here (unlike the client-side memo filters elsewhere in the
  // app) since only one page of logs is ever fetched at a time.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Any filter change should jump back to page 1 — staying on page 4 of a
  // now-much-shorter result set would just show an empty page.
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, actionFilter, entityTypeFilter])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    })
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (actionFilter) params.set('action', actionFilter)
    if (entityTypeFilter) params.set('entityType', entityTypeFilter)

    api
      .get(`/admin/audit?${params.toString()}`)
      .then((r) => {
        setLogs(r.data.data)
        setTotal(r.data.total)
        setLabels(r.data.labels ?? {})
      })
      .finally(() => setLoading(false))
  }, [page, debouncedSearch, actionFilter, entityTypeFilter])

  const filtersActive = Boolean(debouncedSearch || actionFilter || entityTypeFilter)
  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setActionFilter('')
    setEntityTypeFilter('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-[var(--text-muted)] text-sm">
          {total} total {filtersActive ? 'matching ' : ''}entries
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0">
          <Input
            label="Search"
            placeholder="Actor name, email, action, or entity type"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-full sm:w-64 shrink-0">
          <Select
            label="Action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            options={ACTION_OPTIONS}
          />
        </div>
        <div className="w-full sm:w-52 shrink-0">
          <Select
            label="Entity type"
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            options={ENTITY_TYPE_OPTIONS}
          />
        </div>
        {filtersActive && (
          <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <Table
        loading={loading}
        columns={[
          { key: 'actor', label: 'User' },
          { key: 'action', label: 'Action' },
          { key: 'entity', label: 'Entity' },
          { key: 'details', label: 'Details' },
          { key: 'time', label: 'Time' },
        ]}
        data={logs.map((log) => ({
          actor: (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{log.actor?.full_name ?? 'System'}</span>
              {log.actor?.email ? (
                <span className="text-xs text-[var(--text-muted)]">{log.actor.email}</span>
              ) : null}
            </div>
          ),
          action: (
            <code className="text-xs bg-[var(--surface-elevated)] px-2 py-0.5 rounded">
              {log.action}
            </code>
          ),
          entity: (
            <div className="flex flex-col gap-0.5 items-start">
              <Badge size="sm">{titleCase(log.entity_type)}</Badge>
              <span
                className="text-xs text-[var(--text-secondary)]"
                title={log.entity_id ?? undefined}
              >
                {formatEntityId(log.entity_id, log.entity_type, labels, log.details)}
              </span>
            </div>
          ),
          details: (
            <AuditDetails details={(log as { details?: unknown }).details} labels={labels} />
          ),
          time: (
            <span className="text-xs text-[var(--text-muted)]">
              {formatDateTime(log.created_at)}
            </span>
          ),
        }))}
        emptyMessage={filtersActive ? 'No audit logs match these filters' : 'No audit logs found'}
      />

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="px-4 py-2 text-sm text-[var(--text-muted)]">
            Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
