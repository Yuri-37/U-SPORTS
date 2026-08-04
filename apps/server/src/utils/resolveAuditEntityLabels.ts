import supabase from './supabase'
import { resolveParticipantLabelMap } from './participantLabelMap'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Walks an arbitrary JSON value and collects every string that looks like a UUID. */
function collectUuids(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 3 || value == null) return
  if (typeof value === 'string') {
    if (UUID_RE.test(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUuids(v, out, depth + 1)
    return
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectUuids(v, out, depth + 1)
  }
}

/** Every UUID referenced anywhere in an audit log row — its `entity_id` plus any id-shaped value in `details`. */
export function collectAuditLogUuids(
  rows: Array<{ entity_id?: string | null; details?: unknown }>,
): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.entity_id) ids.add(row.entity_id)
    collectUuids(row.details, ids)
  }
  return [...ids]
}

/**
 * Resolves a batch of UUIDs to human-readable labels for the Audit Logs screen —
 * every writeAuditLog() call site stores raw ids (event_id, winner_id, athlete_id,
 * team_id, etc.) with no name attached, so the label lookup happens once here at
 * read time rather than needing every one of the ~40 call sites updated.
 * Checks teams/athletes (already covered by resolveParticipantLabelMap, since a
 * match/bracket "participant" can be either), then events, seasons, profiles,
 * the institution row, and announcements. Matches (the highest-volume entity —
 * every scoring action logs against one) have no name of their own, so they're
 * resolved to "Team A vs Team B" via their participants. IDs that still don't
 * belong to any of these (e.g. a bracket id, or a team/event_participant join
 * row) are left unresolved — the caller falls back to a truncated id for those.
 */
export async function resolveAuditEntityLabels(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return {}

  const map = await resolveParticipantLabelMap(uniq)
  const remaining = uniq.filter((id) => !map[id])
  if (remaining.length === 0) return map

  const [eventsRes, seasonsRes, profilesRes, institutionsRes, announcementsRes, matchesRes] =
    await Promise.all([
      supabase.from('events').select('id, name').in('id', remaining),
      supabase.from('seasons').select('id, name').in('id', remaining),
      supabase.from('profiles').select('id, full_name').in('id', remaining),
      supabase.from('institution').select('id, name').in('id', remaining),
      supabase.from('announcements').select('id, title').in('id', remaining),
      // entity_type: 'match' is the highest-volume audit source (every scoring
      // action logs against it) but a match has no name of its own — resolve
      // it to "Team A vs Team B" via its participants instead.
      supabase
        .from('matches')
        .select('id, participant_a_id, participant_b_id')
        .in('id', remaining),
    ])
  for (const e of eventsRes.data ?? []) map[e.id] = e.name
  for (const s of seasonsRes.data ?? []) map[s.id] = s.name
  for (const p of profilesRes.data ?? []) map[p.id] = p.full_name
  for (const i of institutionsRes.data ?? []) map[i.id] = i.name
  for (const a of announcementsRes.data ?? []) map[a.id] = a.title

  const matches = matchesRes.data ?? []
  if (matches.length > 0) {
    const participantIds = matches.flatMap((m) =>
      [m.participant_a_id, m.participant_b_id].filter((v): v is string => Boolean(v)),
    )
    const participantLabels = await resolveParticipantLabelMap(participantIds)
    for (const m of matches) {
      const a = m.participant_a_id ? (participantLabels[m.participant_a_id] ?? 'TBD') : 'TBD'
      const b = m.participant_b_id ? (participantLabels[m.participant_b_id] ?? 'TBD') : 'TBD'
      map[m.id] = `${a} vs ${b}`
    }
  }

  return map
}
