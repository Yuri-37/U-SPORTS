import { randomUUID } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { fetchSeasonSportSlugs } from '../utils/seasonSports'
import { slugifyEventName } from '../utils/eventSlug'
import { EVENT_CATEGORIES } from './events'
import type { AppSport } from '../utils/organizerSportAccess'

const router = Router()

const DEPARTMENTS = ['SBMA', 'SECA', 'SASE', 'SHS'] as const
const SPORT_ENUM = ['basketball', 'volleyball', 'table-tennis'] as const

const SPORT_LABEL: Record<AppSport, string> = {
  basketball: 'Basketball',
  volleyball: 'Volleyball',
  'table-tennis': 'Table Tennis',
}

/** One representative category per sport — must come from the same list the
 *  create-event route validates against, or the insert fails the enum check. */
const EVENT_SHAPE: Record<
  AppSport,
  { category: string; best_of: number | null; table_tennis_format: 'singles' | null }
> = {
  basketball: { category: EVENT_CATEGORIES.basketball[0], best_of: null, table_tennis_format: null },
  volleyball: { category: EVENT_CATEGORIES.volleyball[0], best_of: 3, table_tennis_format: null },
  'table-tennis': {
    category: EVENT_CATEGORIES['table-tennis'][0],
    best_of: 5,
    table_tennis_format: 'singles',
  },
}

const bodySchema = z.object({
  season_id: z.string().uuid(),
  sports: z.array(z.enum(SPORT_ENUM)).optional(),
  teams_per_sport: z.number().int().min(0).max(20).default(4),
  events_per_sport: z.number().int().min(0).max(10).default(1),
  mode: z.enum(['top_up', 'add']).default('top_up'),
  dry_run: z.boolean().optional(),
})
type Body = z.infer<typeof bodySchema>

interface PlanItem {
  kind: 'team' | 'event'
  sport: AppSport
  name: string
  department?: string | null
  category?: string | null
  skipped_reason?: string
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA", ... — never numeric, never a jersey-number look-alike. */
function letterName(prefix: string, index: number): string {
  let n = index
  let letters = ''
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${prefix} ${letters}`
}

/** Same rule teams.ts's importer uses to dedupe team names — reusing a
 *  different normalization here is how you get a "unique" name that the
 *  importer still treats as a duplicate. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Walks the letter sequence for one sport/kind, skipping any name that
 * already exists (case/whitespace-insensitive). In 'top_up' mode, an
 * existing name at a given letter counts toward satisfying the target
 * without creating anything; in 'add' mode it's just skipped so we never
 * double-book a letter, and `target` new names are always produced. This is
 * also how "how many placeholders already exist" is derived — no separate
 * name-pattern scan needed, so a real team an admin already named "Team A"
 * by coincidence is never miscounted as one of ours.
 */
function planNames(
  prefix: string,
  target: number,
  mode: 'top_up' | 'add',
  taken: Set<string>,
): { names: string[]; alreadySatisfied: number } {
  const names: string[] = []
  let satisfied = 0
  let letterIdx = 0
  const CEILING = 700 // AA..ZZ and then some — comfortably above the 20/10 input caps

  while (letterIdx < CEILING) {
    if (mode === 'add' && names.length >= target) break
    if (mode === 'top_up' && satisfied + names.length >= target) break

    const name = letterName(prefix, letterIdx)
    letterIdx += 1
    if (taken.has(normalizeName(name))) {
      if (mode === 'top_up') satisfied += 1
      continue
    }
    names.push(name)
  }
  return { names, alreadySatisfied: satisfied }
}

async function buildPlaceholderPlan(body: Body) {
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('id', body.season_id)
    .maybeSingle()
  if (seasonErr) throw new Error(seasonErr.message)
  if (!season) throw new Error('Season not found')

  const seasonSports = await fetchSeasonSportSlugs(body.season_id)
  const requestedSports = (body.sports && body.sports.length > 0 ? body.sports : seasonSports) as AppSport[]

  const [{ data: existingTeams, error: teamsErr }, { data: existingEvents, error: eventsErr }] =
    await Promise.all([
      supabase.from('teams').select('name, sport').eq('season_id', body.season_id).in('sport', requestedSports),
      supabase.from('events').select('name, sport').eq('season_id', body.season_id).in('sport', requestedSports),
    ])
  if (teamsErr) throw new Error(teamsErr.message)
  if (eventsErr) throw new Error(eventsErr.message)

  const takenTeamsBySport = new Map<AppSport, Set<string>>()
  for (const t of existingTeams ?? []) {
    const s = t.sport as AppSport
    const set = takenTeamsBySport.get(s) ?? new Set<string>()
    set.add(normalizeName(t.name as string))
    takenTeamsBySport.set(s, set)
  }
  const takenEventsBySport = new Map<AppSport, Set<string>>()
  for (const e of existingEvents ?? []) {
    const s = e.sport as AppSport
    const set = takenEventsBySport.get(s) ?? new Set<string>()
    set.add(normalizeName(e.name as string))
    takenEventsBySport.set(s, set)
  }

  const items: PlanItem[] = []
  let existingTeamsCount = 0
  let existingEventsCount = 0

  for (const sport of requestedSports) {
    if (!seasonSports.includes(sport)) {
      items.push({
        kind: 'team',
        sport,
        name: '(skipped)',
        skipped_reason: `${SPORT_LABEL[sport]} is not enabled for this season`,
      })
      continue
    }

    const teamPlan = planNames(
      `${SPORT_LABEL[sport]} Team`,
      body.teams_per_sport,
      body.mode,
      takenTeamsBySport.get(sport) ?? new Set(),
    )
    existingTeamsCount += teamPlan.alreadySatisfied
    teamPlan.names.forEach((name, i) => {
      items.push({ kind: 'team', sport, name, department: DEPARTMENTS[i % DEPARTMENTS.length] })
    })

    const eventPlan = planNames(
      `${SPORT_LABEL[sport]} Cup`,
      body.events_per_sport,
      body.mode,
      takenEventsBySport.get(sport) ?? new Set(),
    )
    existingEventsCount += eventPlan.alreadySatisfied
    eventPlan.names.forEach((name) => {
      items.push({ kind: 'event', sport, name, category: EVENT_SHAPE[sport].category })
    })
  }

  return {
    season: { id: season.id as string, name: season.name as string },
    sports: requestedSports,
    items,
    totals: {
      teams: items.filter((i) => i.kind === 'team' && !i.skipped_reason).length,
      events: items.filter((i) => i.kind === 'event' && !i.skipped_reason).length,
      skipped: items.filter((i) => Boolean(i.skipped_reason)).length,
    },
    existing_placeholders: { teams: existingTeamsCount, events: existingEventsCount },
  }
}

// Placeholder team/event generator — surfaced in the Super Admin onboarding
// tour and the Help Center, so a fresh season isn't a blank Teams/Events
// page. Admin-only: same trust level as the rest of season configuration.
router.post('/placeholders', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  try {
    const body = bodySchema.parse(req.body)
    const plan = await buildPlaceholderPlan(body)

    if (body.dry_run) {
      return res.json({ plan })
    }

    const created: { teams: string[]; events: string[] } = { teams: [], events: [] }
    const errors: { sport: AppSport; error: string }[] = []

    const itemsBySport = new Map<AppSport, PlanItem[]>()
    for (const item of plan.items) {
      if (item.skipped_reason) continue
      const list = itemsBySport.get(item.sport) ?? []
      list.push(item)
      itemsBySport.set(item.sport, list)
    }

    // Batched per sport (not per row): worst case 20 teams + 10 events × 3
    // sports is 6 round trips, not 90 — the API limiter is 300 req/15min.
    for (const [sport, sportItems] of itemsBySport) {
      const teamRows = sportItems
        .filter((i) => i.kind === 'team')
        .map((i) => ({ name: i.name, sport, season_id: body.season_id, department: i.department ?? null }))
      const shape = EVENT_SHAPE[sport]
      const eventRows = sportItems
        .filter((i) => i.kind === 'event')
        .map((i) => {
          const id = randomUUID()
          return {
            id,
            name: i.name,
            slug: slugifyEventName(i.name, id),
            sport,
            season_id: body.season_id,
            format: 'single_elim',
            category: i.category ?? null,
            table_tennis_format: shape.table_tennis_format,
            best_of: shape.best_of,
            created_by: req.user!.id,
          }
        })

      if (teamRows.length > 0) {
        const { data, error } = await supabase.from('teams').insert(teamRows).select('name')
        if (error) errors.push({ sport, error: error.message })
        else created.teams.push(...(data ?? []).map((t) => t.name as string))
      }
      if (eventRows.length > 0) {
        const { data, error } = await supabase.from('events').insert(eventRows).select('name')
        if (error) errors.push({ sport, error: error.message })
        else created.events.push(...(data ?? []).map((e) => e.name as string))
      }
    }

    // One audit row per run, not per created row — 90 rows would drown the
    // Audit Logs screen for what is, from the admin's point of view, one action.
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'placeholders_generated',
      entityType: 'season',
      entityId: body.season_id,
      details: {
        sports: plan.sports,
        teams_created: created.teams.length,
        events_created: created.events.length,
        error_count: errors.length,
        mode: body.mode,
      },
    })

    res.status(errors.length > 0 ? 207 : 201).json({ plan, created, errors })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not generate placeholders' })
  }
})

export default router
