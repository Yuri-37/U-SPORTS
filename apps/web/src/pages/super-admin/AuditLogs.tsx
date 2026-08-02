import React, { useEffect, useState } from 'react'
import { Table, Badge } from '../../components/ui'
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

function humanizeKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  return key
    .replace(/_id$/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** A resolved name when we have one for this id, else the id itself (short form). */
function resolveLabel(value: string, labels: Record<string, string>): string {
  if (labels[value]) return labels[value]
  if (UUID_RE.test(value)) return `${value.slice(0, 8)}…${value.slice(-4)}`
  return value
}

function formatDetailValue(value: unknown, labels: Record<string, string>): string {
  if (typeof value === 'string') return resolveLabel(value, labels)
  if (Array.isArray(value)) return value.map((v) => formatDetailValue(v, labels)).join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatEntityId(id: string | null, labels: Record<string, string>): string {
  if (!id) return '—'
  return resolveLabel(id, labels)
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
  if (!details || typeof details !== 'object') return <span className="text-[var(--text-muted)]">—</span>
  const d = details as Record<string, unknown>
  const changed = d.changed as Record<string, StatChange> | undefined
  const reason = typeof d.reason === 'string' ? d.reason : null

  const otherKeys = Object.keys(d).filter((k) => k !== 'changed' && k !== 'reason')

  if (!changed && !reason && otherKeys.length === 0) {
    return <span className="text-[var(--text-muted)]">—</span>
  }

  return (
    <div className="flex flex-col gap-1 text-xs max-w-md">
      {reason && (
        <p className="italic text-[var(--text-secondary)]">“{reason}”</p>
      )}
      {changed && Object.keys(changed).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(changed).map(([key, v]) => (
            <span key={key} className="font-mono bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded">
              {key}: <span className="text-[var(--text-muted)]">{v.from}</span> → <span className="font-bold">{v.to}</span>
            </span>
          ))}
        </div>
      )}
      {otherKeys.length > 0 && (
        <span className="text-[var(--text-secondary)]">
          {otherKeys.map((k) => `${humanizeKey(k)}: ${formatDetailValue(d[k], labels)}`).join(' · ')}
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

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/audit?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      .then(r => { setLogs(r.data.data); setTotal(r.data.total); setLabels(r.data.labels ?? {}) })
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-[var(--text-muted)] text-sm">{total} total entries</p>
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
        data={logs.map(log => ({
          actor: (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{log.actor?.full_name ?? 'System'}</span>
              {log.actor?.email ? (
                <span className="text-xs text-[var(--text-muted)]">{log.actor.email}</span>
              ) : null}
            </div>
          ),
          action: <code className="text-xs bg-[var(--surface-elevated)] px-2 py-0.5 rounded">{log.action}</code>,
          entity: (
            <div className="flex flex-col gap-0.5 items-start">
              <Badge size="sm">{log.entity_type}</Badge>
              <span className="text-xs text-[var(--text-secondary)]" title={log.entity_id ?? undefined}>
                {formatEntityId(log.entity_id, labels)}
              </span>
            </div>
          ),
          details: <AuditDetails details={(log as { details?: unknown }).details} labels={labels} />,
          time: <span className="text-xs text-[var(--text-muted)]">{formatDateTime(log.created_at)}</span>,
        }))}
        emptyMessage="No audit logs found"
      />

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded text-sm disabled:opacity-50">← Prev</button>
          <span className="px-4 py-2 text-sm text-[var(--text-muted)]">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded text-sm disabled:opacity-50">Next →</button>
        </div>
      )}
    </div>
  )
}
