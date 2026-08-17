import React, { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Stepper } from '../../ui/Stepper'
import api from '../../../lib/api'
import { getSportLabel, getSportIcon } from '../../../lib/utils'
import type { TourStepContext } from '../../../tours/types'

type Sport = 'basketball' | 'volleyball' | 'table-tennis'

interface SeasonOption {
  id: string
  name: string
  sports: Sport[]
}

interface PlanItem {
  kind: 'team' | 'event'
  sport: Sport
  name: string
  skipped_reason?: string
}
interface Plan {
  season: { id: string; name: string }
  sports: Sport[]
  items: PlanItem[]
  totals: { teams: number; events: number; skipped: number }
  existing_placeholders: { teams: number; events: number }
}

/**
 * The Super Admin tour's centrepiece: pick a season, set counts per sport,
 * preview, then generate placeholder teams/events.
 *
 * Seasons.tsx offers the same generation inline in the Create Season modal —
 * that's the primary path. This step covers the other case: topping up a
 * season that already exists. `ctx` is optional so the component can be
 * rendered outside a tour.
 */
export default function PlaceholderGeneratorStep({ ctx }: { ctx?: TourStepContext }) {
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [teamsPerSport, setTeamsPerSport] = useState(4)
  const [eventsPerSport, setEventsPerSport] = useState(1)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [result, setResult] = useState<{ created: { teams: string[]; events: string[] } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submittedRef = useRef(false)

  useEffect(() => {
    api
      .get<{ id: string; name: string; status: string; sports?: Sport[] }[]>('/admin/seasons')
      .then(({ data }) => {
        const options = (data ?? []).map((s) => ({ id: s.id, name: s.name, sports: s.sports ?? [] }))
        setSeasons(options)
        if (options.length > 0) setSeasonId(options[0].id)
      })
      .catch(() => setSeasons([]))
  }, [])

  useEffect(() => {
    ctx?.setCanAdvance(true) // this step never blocks Next/Finish — generating is optional
  }, [ctx])

  const selectedSeason = seasons.find((s) => s.id === seasonId)

  const runPreview = async () => {
    if (!seasonId) return
    setError('')
    setBusy(true)
    setPlan(null)
    try {
      const { data } = await api.post<{ plan: Plan }>('/season-setup/placeholders', {
        season_id: seasonId,
        teams_per_sport: teamsPerSport,
        events_per_sport: eventsPerSport,
        mode: 'top_up',
        dry_run: true,
      })
      setPlan(data.plan)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not preview')
    } finally {
      setBusy(false)
    }
  }

  const runGenerate = async () => {
    if (!seasonId || submittedRef.current) return
    submittedRef.current = true
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post<{ created: { teams: string[]; events: string[] } }>(
        '/season-setup/placeholders',
        {
          season_id: seasonId,
          teams_per_sport: teamsPerSport,
          events_per_sport: eventsPerSport,
          mode: 'top_up',
          dry_run: false,
        },
      )
      setResult(data)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not generate placeholders')
      submittedRef.current = false
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--success)]">
          <CheckCircle2 className="w-4 h-4" />
          Placeholders created
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {result.created.teams.length} team{result.created.teams.length === 1 ? '' : 's'} and{' '}
          {result.created.events.length} event{result.created.events.length === 1 ? '' : 's'} added to{' '}
          <strong>{selectedSeason?.name}</strong>. Organizers and Coaches can rename or delete these
          from Teams and Events — they're a starting point, not a final roster.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Season</label>
        <select
          value={seasonId}
          onChange={(e) => {
            setSeasonId(e.target.value)
            setPlan(null)
          }}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm"
        >
          {seasons.length === 0 && <option value="">No seasons yet</option>}
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {selectedSeason && selectedSeason.sports.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSeason.sports.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2.5 py-1 text-xs"
            >
              {getSportIcon(s)} {getSportLabel(s)}
            </span>
          ))}
        </div>
      )}

      <Stepper label="Teams per sport" value={teamsPerSport} onChange={setTeamsPerSport} max={20} />
      <p className="text-xs text-[var(--text-muted)] -mt-2">
        {teamsPerSport} × {selectedSeason?.sports.length ?? 0} sports ={' '}
        {teamsPerSport * (selectedSeason?.sports.length ?? 0)} teams
      </p>
      <Stepper label="Events per sport" value={eventsPerSport} onChange={setEventsPerSport} max={10} />
      <p className="text-xs text-[var(--text-muted)] -mt-2">
        {eventsPerSport} × {selectedSeason?.sports.length ?? 0} sports ={' '}
        {eventsPerSport * (selectedSeason?.sports.length ?? 0)} events
      </p>

      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

      {plan && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 space-y-1.5 max-h-40 overflow-y-auto">
          {(plan.existing_placeholders.teams > 0 || plan.existing_placeholders.events > 0) && (
            <p className="text-xs text-[var(--text-muted)]">
              This season already has {plan.existing_placeholders.teams} matching team
              {plan.existing_placeholders.teams === 1 ? '' : 's'} and {plan.existing_placeholders.events}{' '}
              matching event{plan.existing_placeholders.events === 1 ? '' : 's'} — this run adds{' '}
              {plan.totals.teams} more team{plan.totals.teams === 1 ? '' : 's'} and {plan.totals.events} more
              event{plan.totals.events === 1 ? '' : 's'}.
            </p>
          )}
          {plan.items.map((item, i) => (
            <p
              key={i}
              className={`text-xs ${item.skipped_reason ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}
            >
              {item.skipped_reason ? `${item.name} — ${item.skipped_reason}` : `${item.kind === 'team' ? '🏷' : '🏆'} ${item.name}`}
            </p>
          ))}
          {plan.totals.teams === 0 && plan.totals.events === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              Nothing to add — this season already has {teamsPerSport} team(s) and {eventsPerSport} event(s)
              per sport.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!seasonId || busy}
          onClick={() => void runPreview()}
          className="flex-1 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-elevated)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy && !plan ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Preview'}
        </button>
        <button
          type="button"
          disabled={!plan || busy || (plan.totals.teams === 0 && plan.totals.events === 0)}
          onClick={() => void runGenerate()}
          className="flex-1 rounded-lg bg-[#0066FF] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy && plan ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Generate'}
        </button>
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        This is optional — you can skip it and leave detailed setup to your Organizers and Coaches.
      </p>
    </div>
  )
}
