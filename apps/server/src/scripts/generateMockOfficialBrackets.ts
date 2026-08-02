/**
 * Generates single-elimination brackets for [MOCK] Official … events (three sports).
 *
 * Prerequisites: run `supabase/scripts/seed_mock_three_sports_leagues.sql` first so events exist,
 * teams are registered as event_participants, and events are in_progress.
 *
 * Requires apps/server/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 *   pnpm --filter server seed:mock-brackets
 */

import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const EVENT_NAMES = [
  '[MOCK] Official — Basketball Championship',
  '[MOCK] Official — Volleyball Championship',
  '[MOCK] Official — Table Tennis Doubles Open',
] as const

async function main(): Promise<void> {
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/server/.env')
    process.exit(1)
  }

  const { default: supabase } = await import('../utils/supabase')
  const { generateBracket } = await import('../services/bracketGenerator')

  for (const name of EVENT_NAMES) {
    const { data: ev, error: evErr } = await supabase.from('events').select('id, format').eq('name', name).maybeSingle()
    if (evErr) {
      console.error(`Query error (${name}):`, evErr.message)
      continue
    }
    if (!ev?.id) {
      console.warn(`Skip — event not found (run mock league SQL seed first): ${name}`)
      continue
    }

    const { data: parts, error: pErr } = await supabase
      .from('event_participants')
      .select('participant_id, seed')
      .eq('event_id', ev.id)
      .eq('participant_type', 'team')

    if (pErr) {
      console.error(`Participants (${name}):`, pErr.message)
      continue
    }

    const sorted = [...(parts ?? [])].sort((a, b) => {
      const sa = a.seed ?? 999
      const sb = b.seed ?? 999
      if (sa !== sb) return sa - sb
      return String(a.participant_id).localeCompare(String(b.participant_id))
    })
    const ids = sorted.map((p) => p.participant_id as string)

    if (ids.length < 2) {
      console.warn(`Skip (${name}): need at least 2 teams, have ${ids.length}`)
      continue
    }

    const seeds: Record<string, number> = {}
    for (const p of parts ?? []) {
      if (p.seed != null) seeds[p.participant_id as string] = p.seed as number
    }

    const fmt = (ev.format as 'single_elim' | 'double_elim' | 'round_robin') || 'single_elim'

    try {
      const r = await generateBracket(ev.id, ids, fmt, seeds)
      console.log(`${name}: bracket OK (${r.bracketCount} bracket rows, ${r.matchCount} matches)`)
    } catch (e) {
      console.error(`${name}:`, e instanceof Error ? e.message : e)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
