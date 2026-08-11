import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { advanceWinner } from '../services/bracketGenerator'
import { computeInsightsForMatch } from '../services/computeInsights'
import { getActiveSlots } from '../utils/sportConfig'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import {
  getMatchReviewData,
  resolveParticipantDisplayName,
  actionTypeToStatKeys,
} from '../services/matchReviewData'
import { resolveParticipantLabelMap } from '../utils/participantLabelMap'
import { summarizeFinalScore } from '../utils/matchScorePresentation'

const router = Router()

/** Refresh player_season_stats for everyone who logged stats in this match; bump team W/L. Returns season_id. */
async function aggregateOfficialSeasonStatsForMatch(
  matchId: string,
  winnerId: string,
): Promise<string | null> {
  const { data: match } = await supabase
    .from('matches')
    .select('participant_a_id, participant_b_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match) return null

  const { data: event } = await supabase
    .from('events')
    .select('season_id')
    .eq('id', match.event_id)
    .single()

  if (!event?.season_id) return null

  const seasonId = event.season_id

  const { data: gameStats } = await supabase
    .from('player_game_stats')
    .select('athlete_id')
    .eq('match_id', matchId)

  for (const gs of gameStats ?? []) {
    await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: gs.athlete_id,
      p_season_id: seasonId,
    })
  }

  const loserId =
    match.participant_a_id === winnerId ? match.participant_b_id : match.participant_a_id

  // Recompute each side's record from the completed matches themselves rather
  // than incrementing a counter. The old read-then-+1 was neither atomic nor
  // idempotent, and nothing in the app could ever repair a wrong W/L.
  for (const teamId of [winnerId, loserId]) {
    if (!teamId) continue
    await supabase.rpc('recompute_team_season_stats', {
      p_team_id: teamId,
      p_season_id: seasonId,
    })
  }

  return seasonId
}

/** Rerun DB aggregation for all athletes on this match. */
async function recomputePlayerSeasonStatsForMatch(matchId: string): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('event_id')
    .eq('id', matchId)
    .single()

  if (!match) return

  const { data: event } = await supabase
    .from('events')
    .select('season_id')
    .eq('id', match.event_id)
    .single()

  if (!event?.season_id) return

  const { data: gameStats } = await supabase
    .from('player_game_stats')
    .select('athlete_id')
    .eq('match_id', matchId)

  for (const gs of gameStats ?? []) {
    await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: gs.athlete_id,
      p_season_id: event.season_id,
    })
  }
}

// Start a match (set to live + acquire scoring lock)
router.post(
  '/:matchId/start',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { data: match } = await supabase
      .from('matches')
      .select('status, scoring_locked_by, participant_a_id, participant_b_id, event_id, bracket_id')
      .eq('id', req.params.matchId)
      .single()

    if (!match) return res.status(404).json({ error: 'Match not found' })

    // A finished match must not be reopened: doing so allowed extra points on top
    // of a final score and a second /end, which double-counted the standings.
    if (match.status === 'completed') {
      return res.status(409).json({
        error: 'This match is completed. An admin must reopen it before it can be scored again.',
      })
    }

    if (!match.participant_a_id || !match.participant_b_id) {
      return res.status(400).json({ error: 'Assign both participants before starting this match' })
    }

    // Bracket ordering: all earlier matches in the same round must be completed first
    if (match.bracket_id) {
      const { data: bracket } = await supabase
        .from('brackets')
        .select('round, match_order, event_id')
        .eq('id', match.bracket_id)
        .single()

      if (bracket) {
        const { data: earlierBrackets } = await supabase
          .from('brackets')
          .select('id')
          .eq('event_id', bracket.event_id)
          .eq('round', bracket.round)
          .lt('match_order', bracket.match_order)
          .not('participant_a_id', 'is', null)
          .not('participant_b_id', 'is', null)
          .neq('is_bye', true)

        if (earlierBrackets && earlierBrackets.length > 0) {
          const earlierBracketIds = earlierBrackets.map((b: { id: string }) => b.id)
          const { count } = await supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .in('bracket_id', earlierBracketIds)
            .in('status', ['scheduled', 'live'])

          if ((count ?? 0) > 0) {
            return res.status(400).json({ error: 'Complete earlier matches in this round first' })
          }
        }
      }
    }

    if (
      match.status === 'live' &&
      match.scoring_locked_by &&
      match.scoring_locked_by !== req.user!.id
    ) {
      const { data: locker } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', match.scoring_locked_by)
        .single()
      return res.status(409).json({
        error: 'SCORING_LOCKED',
        lockedBy: (locker as { full_name: string } | null)?.full_name ?? 'Another organizer',
        lockedById: match.scoring_locked_by,
      })
    }

    const { data: event } = await supabase
      .from('events')
      .select('sport, table_tennis_format')
      .eq('id', match.event_id)
      .single()
    const sport = event?.sport ?? 'basketball'
    const ttFormat =
      (event as { table_tennis_format?: string | null } | null)?.table_tennis_format ?? null

    if (await respondIfSportForbidden(req, res, sport)) return

    const scores = [match.participant_a_id, match.participant_b_id].filter(Boolean).map((pid) => ({
      match_id: req.params.matchId,
      participant_id: pid,
      sport,
    }))

    await supabase.from('match_scores').upsert(scores, { onConflict: 'match_id,participant_id' })

    // Seed active_lineup from team_members.lineup_slot if not already set
    const { data: existingMatch } = await supabase
      .from('matches')
      .select('active_lineup')
      .eq('id', req.params.matchId)
      .single()

    let activeLineup = (existingMatch as { active_lineup?: unknown } | null)
      ?.active_lineup as Record<string, string[]> | null
    if (!activeLineup) {
      const activeSlots = getActiveSlots(sport, ttFormat)
      const sides: Array<{ key: 'a' | 'b'; pid: string | null }> = [
        { key: 'a', pid: match.participant_a_id },
        { key: 'b', pid: match.participant_b_id },
      ]

      activeLineup = { a: [], b: [] }
      for (const { key, pid } of sides) {
        if (!pid) continue
        // Try to find a team with this participant as team id
        const { data: members } = await supabase
          .from('team_members')
          .select('athlete_id, lineup_slot')
          .eq('team_id', pid)
          .not('lineup_slot', 'is', null)
          .order('lineup_slot', { ascending: true })
          .limit(activeSlots)

        activeLineup[key] = (
          (members ?? []) as Array<{ athlete_id: string | null; lineup_slot: number | null }>
        )
          .filter((m) => m.athlete_id)
          .map((m) => m.athlete_id as string)
      }
    }

    await supabase
      .from('matches')
      // scored_by is never cleared (unlike scoring_locked_by, which /end resets) —
      // it's the score sheet's persistent "who ran this match" record.
      .update({
        status: 'live',
        scoring_locked_by: req.user!.id,
        scoring_locked_at: new Date().toISOString(),
        active_lineup: activeLineup,
        scored_by: req.user!.id,
      })
      .eq('id', req.params.matchId)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_started',
      entityType: 'match',
      entityId: req.params.matchId,
      details: { event_id: match.event_id },
    })

    res.json({ success: true, activeLineup })
  },
)

// Record a scoring action
router.post(
  '/:matchId/action',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      participantId: z.string().uuid(),
      athleteId: z.string().uuid().optional(),
      actionType: z.string(),
      value: z.number().default(1),
      quarterOrSet: z.number().int().min(1).max(MAX_PERIOD).optional(),
      // Accepted for backwards compatibility but ignored — the sport is derived
      // from the event so a client cannot write basketball points into set columns.
      sport: z.string().optional(),
    })

    try {
      const body = schema.parse(req.body)
      const matchId = req.params.matchId as string

      const { data: match } = await supabase
        .from('matches')
        .select('status, scoring_locked_by, participant_a_id, participant_b_id, current_period')
        .eq('id', matchId)
        .single()

      if (!match || match.status !== 'live') {
        return res.status(400).json({ error: 'Match is not live' })
      }

      // Authoritative sport — never from the request body.
      const sport = await getMatchSport(matchId)
      if (!sport) return res.status(404).json({ error: 'Event not found for this match' })
      if (await respondIfSportForbidden(req, res, sport)) return

      // Authoritative period — server state, not the client's React variable.
      // A client-supplied period is only honoured when it matches, so a stale tab
      // can never write into a period the match has already moved past.
      const period = Number(match.current_period ?? 1)
      if (body.quarterOrSet != null && body.quarterOrSet !== period) {
        return res.status(409).json({
          error: `Match is in period ${period}; refresh before scoring`,
          currentPeriod: period,
        })
      }
      if (period > maxPeriodFor(sport)) {
        return res.status(400).json({ error: `Invalid period ${period} for ${sport}` })
      }

      const lockedPeriods = await getLockedPeriods(matchId)
      if (lockedPeriods.includes(period)) {
        return res.status(409).json({ error: `Period ${period} is validated and locked` })
      }

      if (!ALLOWED_ACTIONS[sport]?.includes(body.actionType)) {
        return res.status(400).json({ error: `Invalid action '${body.actionType}' for ${sport}` })
      }

      // The point must belong to one of this match's two participants.
      if (
        body.participantId !== match.participant_a_id &&
        body.participantId !== match.participant_b_id
      ) {
        return res.status(400).json({ error: 'Participant is not part of this match' })
      }

      if (body.athleteId && !(await isAthleteOnParticipant(body.participantId, body.athleteId))) {
        return res.status(400).json({ error: 'Athlete is not on this participant’s roster' })
      }

      const effect = pointEffect(sport, body.actionType)
      if (effect.scores && match.scoring_locked_by !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have scoring lock for this match' })
      }

      // Stat magnitude is decided by the server. A scoring action is worth exactly
      // its point value; a non-scoring stat counts once. The client's `value` is
      // never trusted (it previously let `{point_3, value: 250}` inflate a player).
      const statValue = effect.scores ? effect.points : 1

      // Resolve which participant receives the point
      const opponentId =
        body.participantId === match.participant_a_id
          ? match.participant_b_id
          : match.participant_a_id
      const scoringParticipantId = effect.target === 'own' ? body.participantId : opponentId

      // Log the action
      const { data: insertedRows, error: insertError } = await supabase
        .from('scoring_actions')
        .insert({
          match_id: matchId,
          participant_id: body.participantId,
          athlete_id: body.athleteId ?? null,
          sport,
          action_type: body.actionType,
          value: statValue,
          quarter_or_set: period,
          recorded_by: req.user!.id,
        })
        .select('id')
      if (insertError) throw new Error(`Failed to log action: ${insertError.message}`)
      const insertedId = (insertedRows as Array<{ id: string }> | null)?.[0]?.id

      // Update period score for scoring actions
      if (effect.scores && scoringParticipantId) {
        const scoreField = getScoreField(sport, period)
        if (scoreField) {
          await supabase.rpc('increment_match_score', {
            p_match_id: matchId,
            p_participant_id: scoringParticipantId,
            p_field: scoreField,
            p_value: effect.points,
          })
          if (
            (sport === 'volleyball' || sport === 'table-tennis') &&
            match.participant_a_id &&
            match.participant_b_id
          ) {
            await recomputePeriodWins(
              matchId,
              sport,
              match.participant_a_id,
              match.participant_b_id,
            )
          }
        }

        // Store scoreboard snapshot (score_after column added in migration 040)
        if (insertedId) {
          const { data: afterScores } = await supabase
            .from('match_scores')
            .select(
              'participant_id, q1, q2, q3, q4, ot, set1, set2, set3, set4, set5, game1, game2, game3, game4, game5',
            )
            .eq('match_id', matchId)
          if (afterScores) {
            await supabase
              .from('scoring_actions')
              .update({ score_after: afterScores })
              .eq('id', insertedId)
          }
        }
      }

      // Update player game stats if athlete is specified
      if (body.athleteId) {
        await updatePlayerGameStats(matchId, body.athleteId, sport, body.actionType, 1)
      }

      res.json({ success: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed'
      res.status(400).json({ error: message })
    }
  },
)

// Move the live period (quarter / set / game). The period is server state so it
// survives refreshes and is identical for every scorer and every spectator view.
router.patch(
  '/:matchId/period',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const schema = z.object({ period: z.number().int().min(1).max(MAX_PERIOD) })
    const matchId = req.params.matchId as string

    try {
      const { period } = schema.parse(req.body)

      const { data: match } = await supabase
        .from('matches')
        .select('status, scoring_locked_by')
        .eq('id', matchId)
        .maybeSingle()
      if (!match) return res.status(404).json({ error: 'Match not found' })
      if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })
      if (match.scoring_locked_by !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have scoring lock for this match' })
      }

      const sport = await getMatchSport(matchId)
      if (!sport) return res.status(404).json({ error: 'Event not found for this match' })
      if (await respondIfSportForbidden(req, res, sport)) return
      if (period > maxPeriodFor(sport)) {
        return res
          .status(400)
          .json({ error: `${sport} has at most ${maxPeriodFor(sport)} periods` })
      }

      const locked = await getLockedPeriods(matchId)
      if (locked.includes(period)) {
        return res.status(409).json({ error: `Period ${period} is validated and locked` })
      }

      await supabase.from('matches').update({ current_period: period }).eq('id', matchId)

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_period_changed',
        entityType: 'match',
        entityId: matchId,
        details: { period, sport },
      })

      res.json({ success: true, current_period: period })
    } catch (err: unknown) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Could not change period' })
    }
  },
)

// Persist the live game clock (see migration 055). Written on explicit
// transitions (start/pause/adjust/reset) — never on every tick — because
// clock_updated_at lets a reload reconstruct the true current value by
// adding elapsed real time on top of the last saved snapshot when the clock
// was left running.
router.patch(
  '/:matchId/clock',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const schema = z.object({
      seconds: z.number().int().min(0),
      running: z.boolean(),
      shotClockSeconds: z.number().int().min(0).optional(),
      shotClockRunning: z.boolean().optional(),
    })

    try {
      const body = schema.parse(req.body)

      const { data: match } = await supabase
        .from('matches')
        .select('status, clock_locked_by')
        .eq('id', matchId)
        .maybeSingle()
      if (!match) return res.status(404).json({ error: 'Match not found' })
      if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })

      // The clock lock is independent of scoring_locked_by, so a second
      // organizer can run the clock while someone else scores. Nobody has to
      // explicitly claim it — whoever touches the clock first while it's
      // unclaimed becomes the holder, same auto-claim spirit as /start.
      const isFirstClaim = !match.clock_locked_by
      if (!isFirstClaim && match.clock_locked_by !== req.user!.id) {
        const { data: locker } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', match.clock_locked_by)
          .single()
        return res.status(403).json({
          error: 'CLOCK_LOCKED',
          lockedBy: (locker as { full_name: string } | null)?.full_name ?? 'Another organizer',
          lockedById: match.clock_locked_by,
        })
      }

      const sport = await getMatchSport(matchId)
      if (await respondIfSportForbidden(req, res, sport)) return

      await supabase
        .from('matches')
        .update({
          clock_seconds: body.seconds,
          clock_running: body.running,
          shot_clock_seconds: body.shotClockSeconds ?? null,
          shot_clock_running: body.shotClockRunning ?? false,
          clock_updated_at: new Date().toISOString(),
          clock_locked_by: req.user!.id,
          // Only stamp a fresh claim time on the actual claim, not on every
          // routine start/pause/reset call from the same holder.
          ...(isFirstClaim ? { clock_locked_at: new Date().toISOString() } : {}),
        })
        .eq('id', matchId)

      res.json({ success: true })
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update clock' })
    }
  },
)

// Transfer the clock lock (independent of the scoring lock — see /clock above)
router.post(
  '/:matchId/clock/transfer-lock',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string

    const { data: before } = await supabase
      .from('matches')
      .select('clock_locked_by, clock_locked_at, status')
      .eq('id', matchId)
      .maybeSingle()
    if (!before) return res.status(404).json({ error: 'Match not found' })
    if (before.status === 'completed') {
      return res.status(400).json({ error: 'Match is already completed' })
    }

    const sport = await getMatchSport(matchId)
    if (sport !== 'basketball') {
      return res.status(400).json({ error: `${sport} has no game clock` })
    }
    if (await respondIfSportForbidden(req, res, sport)) return

    await supabase
      .from('matches')
      .update({ clock_locked_by: req.user!.id, clock_locked_at: new Date().toISOString() })
      .eq('id', matchId)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'clock_lock_transferred',
      entityType: 'match',
      entityId: matchId,
      details: {
        previous_holder_id: before.clock_locked_by ?? null,
        previous_locked_at: before.clock_locked_at ?? null,
      },
    })

    res.json({ success: true })
  },
)

// Record who served first. Everything downstream (deriveServer) is arithmetic
// from this one bit plus the score — nothing per-rally is stored. Only
// meaningful for volleyball/table-tennis; warn-but-allow means this can be
// changed at any time (e.g. corrected after a wrong coin-toss entry), which
// only affects serve derivation from that point forward, not past scores.
router.patch(
  '/:matchId/first-server',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const schema = z.object({ participantId: z.string().uuid() })

    try {
      const { participantId } = schema.parse(req.body)

      const { data: match } = await supabase
        .from('matches')
        .select('status, scoring_locked_by, participant_a_id, participant_b_id')
        .eq('id', matchId)
        .maybeSingle()
      if (!match) return res.status(404).json({ error: 'Match not found' })
      if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })
      if (match.scoring_locked_by !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have scoring lock for this match' })
      }
      if (participantId !== match.participant_a_id && participantId !== match.participant_b_id) {
        return res.status(400).json({ error: 'Server must be one of this match’s participants' })
      }

      const sport = await getMatchSport(matchId)
      if (await respondIfSportForbidden(req, res, sport)) return
      if (sport !== 'volleyball' && sport !== 'table-tennis') {
        return res.status(400).json({ error: `${sport} has no serve to record` })
      }

      await supabase.from('matches').update({ first_server_id: participantId }).eq('id', matchId)

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_first_server_set',
        entityType: 'match',
        entityId: matchId,
        details: { participant_id: participantId },
      })

      res.json({ success: true })
    } catch (err: unknown) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Could not set first server' })
    }
  },
)

// Validate (close) a period. Freezes its scores and blocks further writes to it.
router.post(
  '/:matchId/period/:period/validate',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const period = Number(req.params.period)

    try {
      if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
        return res.status(400).json({ error: 'Invalid period' })
      }

      const { data: match } = await supabase
        .from('matches')
        .select('status, scoring_locked_by, participant_a_id, participant_b_id')
        .eq('id', matchId)
        .maybeSingle()
      if (!match) return res.status(404).json({ error: 'Match not found' })
      if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })
      if (match.scoring_locked_by !== req.user!.id) {
        return res.status(403).json({ error: 'You do not have scoring lock for this match' })
      }

      const sport = await getMatchSport(matchId)
      if (!sport) return res.status(404).json({ error: 'Event not found for this match' })
      if (await respondIfSportForbidden(req, res, sport)) return

      const field = getScoreField(sport, period)
      if (!field)
        return res.status(400).json({ error: `Period ${period} is not valid for ${sport}` })

      const { data: rows } = await supabase.from('match_scores').select('*').eq('match_id', matchId)
      const scoreRows = (rows ?? []) as Array<Record<string, unknown>>
      const scoreOf = (pid: string | null) =>
        Number(scoreRows.find((r) => r.participant_id === pid)?.[field] ?? 0)
      const scoreA = scoreOf(match.participant_a_id)
      const scoreB = scoreOf(match.participant_b_id)

      // For sports with a defined win condition, refuse to certify an unfinished
      // period — this is what makes "validated" mean something.
      if (sport === 'volleyball' || sport === 'table-tennis') {
        if (!getSetWinner(sport, scoreA, scoreB, period)) {
          const target = sport === 'volleyball' ? (period === 5 ? 15 : 25) : 11
          return res.status(400).json({
            error: `Period ${period} is not finished (${scoreA}-${scoreB}); needs ${target}+ and a 2-point lead`,
          })
        }
      } else if (scoreA === 0 && scoreB === 0) {
        return res.status(400).json({ error: `Period ${period} has no score yet` })
      }

      const { error: lockErr } = await supabase.from('match_period_locks').insert({
        match_id: matchId,
        period,
        score_a: scoreA,
        score_b: scoreB,
        locked_by: req.user!.id,
      })
      if (lockErr) {
        if (lockErr.code === '23505')
          return res.status(409).json({ error: `Period ${period} is already validated` })
        return res.status(400).json({ error: lockErr.message })
      }

      // Advance to the next period automatically when one exists and is unlocked.
      const locked = await getLockedPeriods(matchId)
      const next = period + 1
      let advancedTo: number | null = null
      if (next <= maxPeriodFor(sport) && !locked.includes(next)) {
        await supabase.from('matches').update({ current_period: next }).eq('id', matchId)
        advancedTo = next
      }

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_period_validated',
        entityType: 'match',
        entityId: matchId,
        details: { period, sport, score_a: scoreA, score_b: scoreB, advanced_to: advancedTo },
      })

      // Tell the client explicitly what happened — the frontend can't reliably
      // infer the new current_period from its own stale `currentPeriod` state
      // right after this call (loadState()'s setState hasn't landed yet).
      res.json({ success: true, period, score_a: scoreA, score_b: scoreB, advanced_to: advancedTo })
    } catch (err: unknown) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Could not validate period' })
    }
  },
)

// Reopen a validated period. Admin-only and audited — this is the deliberate
// escape hatch for a genuine scoring error, not a routine action.
router.delete(
  '/:matchId/period/:period/validate',
  requireAuth,
  requireRole('Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const period = Number(req.params.period)
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''

    if (!Number.isInteger(period)) return res.status(400).json({ error: 'Invalid period' })
    if (reason.length < 3)
      return res.status(400).json({ error: 'A reason is required to reopen a validated period' })

    const { data: existing } = await supabase
      .from('match_period_locks')
      .select('score_a, score_b')
      .eq('match_id', matchId)
      .eq('period', period)
      .maybeSingle()
    if (!existing) return res.status(404).json({ error: 'That period is not validated' })

    await supabase.from('match_period_locks').delete().eq('match_id', matchId).eq('period', period)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_period_unlocked',
      entityType: 'match',
      entityId: matchId,
      details: { period, reason, score_at_lock: { a: existing.score_a, b: existing.score_b } },
    })

    res.json({ success: true })
  },
)

// Undo last action — optional body: { scoringParticipantId } to undo the last
// point scored for a specific team (rolls back score + originating player stat).
router.post(
  '/:matchId/undo',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const { scoringParticipantId } = (req.body ?? {}) as { scoringParticipantId?: string }

    const { data: match } = await supabase
      .from('matches')
      .select('participant_a_id, participant_b_id, status, scoring_locked_by')
      .eq('id', matchId)
      .single()

    // Undo previously had no status guard at all — a completed match's score could
    // be decremented after the bracket had already advanced.
    if (!match) return res.status(404).json({ error: 'Match not found' })
    if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })
    if (match.scoring_locked_by !== req.user!.id) {
      return res.status(403).json({ error: 'You do not have scoring lock for this match' })
    }

    const matchSport = await getMatchSport(matchId)
    if (await respondIfSportForbidden(req, res, matchSport)) return

    // Fetch enough candidates to find a genuinely scoreable action regardless of
    // whether a specific team was requested. Undo must never target a
    // non-scoring row (e.g. a 'foul', or a 'substitution'/'timeout' added
    // later) — those aren't reverted by the logic below at all, so silently
    // flipping one to `undone` would desync the action log from reality.
    const { data: actions } = await supabase
      .from('scoring_actions')
      .select('*')
      .eq('match_id', matchId)
      .eq('undone', false)
      .order('timestamp', { ascending: false })
      .limit(30)

    if (!actions || actions.length === 0)
      return res.status(404).json({ error: 'No action to undo' })

    const targetAction = (actions as Record<string, unknown>[]).find((a) => {
      const effect = pointEffect(String(a.sport ?? 'basketball'), String(a.action_type ?? ''))
      if (!effect.scores) return false
      if (!scoringParticipantId) return true
      const actingPid = a.participant_id as string | null
      const scoring =
        effect.target === 'own'
          ? actingPid
          : actingPid === match?.participant_a_id
            ? match?.participant_b_id
            : match?.participant_a_id
      return scoring === scoringParticipantId
    })

    if (!targetAction) {
      return res.status(404).json({
        error: scoringParticipantId
          ? 'No scoreable action to undo for this team'
          : 'No scoreable action to undo',
      })
    }

    // A validated period is frozen — undo must not reach back into it.
    const targetPeriod = Number(targetAction.quarter_or_set ?? 1)
    const lockedPeriods = await getLockedPeriods(matchId)
    if (lockedPeriods.includes(targetPeriod)) {
      return res.status(409).json({
        error: `That action is in period ${targetPeriod}, which is validated and locked`,
      })
    }

    // Claim the row with a single conditional UPDATE rather than a plain
    // write — `.eq('undone', false)` makes this one atomic statement, so two
    // concurrent undo requests targeting the same action can't both succeed:
    // whichever commits first flips the row, and the second's WHERE clause
    // no longer matches it (0 rows affected), instead of both blindly
    // decrementing the score.
    const { data: claimed } = await supabase
      .from('scoring_actions')
      .update({ undone: true })
      .eq('id', targetAction.id)
      .eq('undone', false)
      .select('id')
      .maybeSingle()
    if (!claimed) {
      return res.status(409).json({ error: 'This action was already undone' })
    }

    const sport = String(targetAction.sport ?? 'basketball')
    const effect = pointEffect(sport, String(targetAction.action_type ?? ''))
    const actingParticipantId = targetAction.participant_id as string | null

    if (effect.scores && actingParticipantId && match) {
      const opponentId =
        actingParticipantId === match.participant_a_id
          ? match.participant_b_id
          : match.participant_a_id
      const scoringPid = effect.target === 'own' ? actingParticipantId : opponentId

      if (scoringPid) {
        const scoreField = getScoreField(sport, Number(targetAction.quarter_or_set ?? 1))
        if (scoreField) {
          await supabase.rpc('increment_match_score', {
            p_match_id: matchId,
            p_participant_id: scoringPid,
            p_field: scoreField,
            p_value: -effect.points,
          })
          if (
            (sport === 'volleyball' || sport === 'table-tennis') &&
            match.participant_a_id &&
            match.participant_b_id
          ) {
            await recomputePeriodWins(
              matchId,
              sport,
              match.participant_a_id,
              match.participant_b_id,
            )
          }
        }
      }
    }

    // Reverse the player stat that was recorded with this action
    const athleteId = targetAction.athlete_id as string | null
    if (athleteId) {
      await updatePlayerGameStats(
        matchId,
        athleteId,
        sport,
        String(targetAction.action_type ?? ''),
        -1,
      )
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'scoring_action_undone',
      entityType: 'match',
      entityId: matchId,
      details: {
        undone_action_id: targetAction.id,
        action_type: targetAction.action_type,
        sport,
      },
    })

    res.json({ success: true })
  },
)

// End match
router.post(
  '/:matchId/end',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const schema = z.object({
      winnerId: z.string().uuid(),
      // Set once the organizer has confirmed past a score_mismatch/
      // score_not_decided warning (forfeits/injury defaults are legitimate
      // reasons the picked winner might not match the recorded score).
      confirmOverride: z.boolean().optional(),
    })

    try {
      const { winnerId, confirmOverride } = schema.parse(req.body)
      const matchId = req.params.matchId as string

      const { data: match } = await supabase
        .from('matches')
        .select('status, participant_a_id, participant_b_id')
        .eq('id', matchId)
        .maybeSingle()
      if (!match) return res.status(404).json({ error: 'Match not found' })

      // Idempotency. This endpoint increments team W/L, so a second call used to
      // credit a team with two wins for one game — permanently, since nothing in
      // the app could recompute team_season_stats.
      if (match.status === 'completed') {
        return res.status(409).json({ error: 'This match has already been ended' })
      }
      if (match.status !== 'live') {
        return res.status(400).json({ error: 'Only a live match can be ended' })
      }
      if (winnerId !== match.participant_a_id && winnerId !== match.participant_b_id) {
        return res.status(400).json({ error: 'Winner must be one of this match’s participants' })
      }

      const sport = await getMatchSport(matchId)
      if (await respondIfSportForbidden(req, res, sport)) return

      // Cross-check the chosen winner against the recorded score — soft block
      // only, since a forfeit or injury default legitimately picks a winner
      // the score doesn't reflect. `computeMatchDecision` is the same
      // read-only decision logic /state already uses for the live scoreboard.
      if (!confirmOverride) {
        const [eventInfo, scoresRes, locksRes] = await Promise.all([
          getMatchEventInfo(matchId),
          supabase.from('match_scores').select('*').eq('match_id', matchId),
          supabase.from('match_period_locks').select('period').eq('match_id', matchId),
        ])
        const scores = (scoresRes.data ?? []) as Array<Record<string, unknown>>
        const scoreRowA = scores.find((s) => s.participant_id === match.participant_a_id)
        const scoreRowB = scores.find((s) => s.participant_id === match.participant_b_id)
        const lockedPeriods = (locksRes.data ?? []).map((l) =>
          Number((l as { period: number }).period),
        )
        const decision = computeMatchDecision(
          sport ?? 'basketball',
          scoreRowA,
          scoreRowB,
          lockedPeriods,
          eventInfo?.bestOf ?? null,
          match.participant_a_id,
          match.participant_b_id,
        )
        if (!decision.decided) {
          return res.status(409).json({
            error: 'score_not_decided',
            message: 'The recorded score has not reached a normal match completion point yet.',
            decision,
          })
        }
        if (decision.winnerParticipantId !== winnerId) {
          return res.status(409).json({
            error: 'score_mismatch',
            message: 'The recorded score does not match the winner you selected.',
            decision,
          })
        }
      }

      // advanceWinner can throw (e.g. the next round already started with a
      // different team). Run it FIRST, while the match is still `live` — it
      // never reads match.status, so this is safe. Previously the status flip
      // happened first, so a throw here left the match permanently stuck:
      // already `completed` (can't /end again, 409) but also un-reopenable
      // (/start refuses a completed match), with stats never aggregated.
      await advanceWinner(matchId, winnerId)

      await supabase
        .from('matches')
        .update({ status: 'completed', scoring_locked_by: null, clock_locked_by: null })
        .eq('id', matchId)

      const seasonId = await aggregateOfficialSeasonStatsForMatch(
        req.params.matchId as string,
        winnerId,
      )

      if (seasonId) {
        void computeInsightsForMatch(req.params.matchId as string, seasonId).catch((e) =>
          console.error('[insights] match_end computation failed:', e),
        )
      }

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_ended',
        entityType: 'match',
        entityId: req.params.matchId,
        details: { winner_id: winnerId },
      })

      res.json({ success: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'End match failed'
      res.status(400).json({ error: message })
    }
  },
)

// Get live match state
router.get('/:matchId/state', async (req, res) => {
  const matchId = req.params.matchId
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle()
  const eventInfo = await getMatchEventInfo(matchId)
  const sport = eventInfo?.sport ?? 'basketball'

  const [scoresRes, actionsRes, teamStats, nameA, nameB] = await Promise.all([
    supabase.from('match_scores').select('*').eq('match_id', matchId),
    supabase
      .from('scoring_actions')
      .select('*')
      .eq('match_id', matchId)
      .eq('undone', false)
      .order('timestamp', { ascending: false })
      .limit(20),
    aggregateTeamStatsByAction(matchId),
    resolveParticipantDisplayName(match?.participant_a_id ?? null),
    resolveParticipantDisplayName(match?.participant_b_id ?? null),
  ])

  const { data: locks } = await supabase
    .from('match_period_locks')
    .select('period, score_a, score_b, locked_at')
    .eq('match_id', matchId)
    .order('period', { ascending: true })

  const lockedPeriods = (locks ?? []).map((l) => Number((l as { period: number }).period))
  const aId = (match as { participant_a_id?: string | null } | null)?.participant_a_id ?? null
  const bId = (match as { participant_b_id?: string | null } | null)?.participant_b_id ?? null
  const scores = (scoresRes.data ?? []) as Array<Record<string, unknown>>
  const scoreRowA = scores.find((s) => s.participant_id === aId)
  const scoreRowB = scores.find((s) => s.participant_id === bId)
  const currentPeriod = Number((match as { current_period?: number } | null)?.current_period ?? 1)

  const matchDecision = computeMatchDecision(
    sport,
    scoreRowA,
    scoreRowB,
    lockedPeriods,
    eventInfo?.bestOf ?? null,
    aId,
    bId,
  )
  const serve = await deriveServer(
    matchId,
    sport,
    currentPeriod,
    (match as { first_server_id?: string | null } | null)?.first_server_id ?? null,
    scoreRowA,
    scoreRowB,
    aId,
    bId,
  )

  let basketball: Record<string, unknown> | null = null
  let volleyball: Record<string, unknown> | null = null
  let tableTennis: Record<string, unknown> | null = null

  if (sport === 'basketball') {
    const [teamFouls, fouledOut] = await Promise.all([
      countActionsByParticipant(matchId, 'foul', currentPeriod),
      fouledOutAthletes(matchId),
    ])
    basketball = {
      teamFouls: { a: teamFouls[aId ?? ''] ?? 0, b: teamFouls[bId ?? ''] ?? 0 },
      bonus: {
        a: (teamFouls[aId ?? ''] ?? 0) >= GAME_LIMITS.teamFoulBonus,
        b: (teamFouls[bId ?? ''] ?? 0) >= GAME_LIMITS.teamFoulBonus,
      },
      fouledOut,
    }
  } else if (sport === 'volleyball') {
    const [subs, timeouts] = await Promise.all([
      countActionsByParticipant(matchId, 'substitution', currentPeriod),
      countActionsByParticipant(matchId, 'timeout', currentPeriod),
    ])
    volleyball = {
      subsUsed: { a: subs[aId ?? ''] ?? 0, b: subs[bId ?? ''] ?? 0 },
      timeouts: { a: timeouts[aId ?? ''] ?? 0, b: timeouts[bId ?? ''] ?? 0 },
    }
  } else if (sport === 'table-tennis') {
    const timeouts = await countActionsByParticipant(matchId, 'timeout', null)
    tableTennis = { timeouts: { a: timeouts[aId ?? ''] ?? 0, b: timeouts[bId ?? ''] ?? 0 } }
  }

  res.json({
    match: match ?? null,
    scores: scoresRes.data ?? [],
    recentActions: actionsRes.data ?? [],
    teamStats,
    participantNames: { a: nameA, b: nameB },
    currentPeriod,
    lockedPeriods,
    periodLocks: locks ?? [],
    matchDecision,
    serve,
    basketball,
    volleyball,
    tableTennis,
    limits: GAME_LIMITS,
  })
})

// Public roster + per-player stats for a match. Roster shows for live and
// completed matches; individual stats are only ever populated once the
// match is completed — zeroed out here, server-side, so the rule holds even
// if a client inspects the network response directly, not just a UI hide.
// Reuses the same roster/stat assembly as the organizer-only /review route,
// but hand-builds the response so organizer-sensitive fields (scorerName,
// lock holders, active_lineup) never reach a public caller.
router.get('/:matchId/roster', async (req, res) => {
  const data = await getMatchReviewData(req.params.matchId)
  if (!data) return res.status(404).json({ error: 'Match not found' })

  const matchStatus = (data.match as { status?: string }).status ?? 'scheduled'
  const isCompleted = matchStatus === 'completed'

  const playerStats = (
    data.playerStats as Array<{
      athlete_id: string
      athlete: unknown
      team_id: string | null
      team_name: string
      participant_side: 'a' | 'b' | null
      stats: Record<string, unknown>
    }>
  ).map((p) => ({
    athlete_id: p.athlete_id,
    athlete: p.athlete,
    team_id: p.team_id,
    team_name: p.team_name,
    participant_side: p.participant_side,
    stats: isCompleted ? p.stats : {},
  }))

  res.json({
    match: { id: (data.match as { id: string }).id, status: matchStatus },
    participantNames: data.participantNames,
    playerStats,
  })
})

// Transfer scoring lock
router.post(
  '/:matchId/transfer-lock',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string

    // Record who was displaced — previously this logged an empty details object,
    // so a lock steal left no trace of whose control was taken.
    const { data: before } = await supabase
      .from('matches')
      .select('scoring_locked_by, scoring_locked_at, status')
      .eq('id', matchId)
      .maybeSingle()
    if (!before) return res.status(404).json({ error: 'Match not found' })
    if (before.status === 'completed') {
      return res.status(400).json({ error: 'Match is already completed' })
    }

    const sport = await getMatchSport(matchId)
    if (await respondIfSportForbidden(req, res, sport)) return

    await supabase
      .from('matches')
      .update({ scoring_locked_by: req.user!.id, scoring_locked_at: new Date().toISOString() })
      .eq('id', matchId)

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'scoring_lock_transferred',
      entityType: 'match',
      entityId: matchId,
      details: {
        previous_holder_id: before.scoring_locked_by ?? null,
        previous_locked_at: before.scoring_locked_at ?? null,
      },
    })

    res.json({ success: true })
  },
)

/** Action types each sport accepts. Anything else is rejected rather than
 *  silently stored as an inert `scoring_actions` row. */
const ALLOWED_ACTIONS: Record<string, readonly string[]> = {
  basketball: [
    'point_1',
    'point_2',
    'point_3',
    // Misses. Recorded so FG% / 3P% / FT% are derivable — previously only makes
    // were tracked, which made every shooting percentage impossible to compute.
    'miss_1',
    'miss_2',
    'miss_3',
    'rebound',
    'off_rebound',
    'assist',
    'steal',
    'block',
    'turnover',
    'foul',
  ],
  volleyball: [
    'point_1',
    'kill',
    'ace',
    'block',
    'dig',
    'assist',
    'error',
    'serve_error',
    'reception_error',
    'timeout',
  ],
  'table-tennis': ['point_1', 'tt_winner', 'tt_ace', 'tt_error', 'timeout'],
}

/** Period columns per sport, in order. Index 0 == period 1. */
const PERIOD_FIELDS: Record<string, readonly string[]> = {
  basketball: ['q1', 'q2', 'q3', 'q4', 'ot', 'ot2', 'ot3'],
  volleyball: ['set1', 'set2', 'set3', 'set4', 'set5'],
  'table-tennis': ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7'],
}

/** Upper bound accepted by the request schema; per-sport limit enforced separately. */
const MAX_PERIOD = 7

function maxPeriodFor(sport: string): number {
  return PERIOD_FIELDS[sport]?.length ?? 5
}

/** Periods already validated and frozen for a match. */
async function getLockedPeriods(matchId: string): Promise<number[]> {
  const { data } = await supabase
    .from('match_period_locks')
    .select('period')
    .eq('match_id', matchId)
  return (data ?? []).map((r) => Number((r as { period: number }).period))
}

/** Resolve the authoritative sport for a match from its event — never trust the client. */
async function getMatchSport(matchId: string): Promise<string | null> {
  const { data: m } = await supabase
    .from('matches')
    .select('event_id')
    .eq('id', matchId)
    .maybeSingle()
  if (!m?.event_id) return null
  const { data: e } = await supabase
    .from('events')
    .select('sport')
    .eq('id', m.event_id)
    .maybeSingle()
  return e?.sport ?? null
}

/** True when `athleteId` is actually eligible to record a stat for `participantId`.
 *  Team participants are checked against their roster; individual participants
 *  (table-tennis singles) must be the athlete themselves. */
async function isAthleteOnParticipant(participantId: string, athleteId: string): Promise<boolean> {
  const { data: roster } = await supabase
    .from('team_members')
    .select('athlete_id')
    .eq('team_id', participantId)
  if (roster && roster.length > 0) {
    return roster.some((r) => (r as { athlete_id?: string }).athlete_id === athleteId)
  }
  // No roster rows: participant is an individual entrant, not a team.
  return participantId === athleteId
}

/** Maps an action to its point effect: whether it scores, who gets the point, and how many. */
function pointEffect(
  sport: string,
  actionType: string,
): { scores: boolean; target: 'own' | 'opponent'; points: number } {
  if (sport === 'basketball') {
    if (actionType === 'point_1') return { scores: true, target: 'own', points: 1 }
    if (actionType === 'point_2') return { scores: true, target: 'own', points: 2 }
    if (actionType === 'point_3') return { scores: true, target: 'own', points: 3 }
  }
  if (sport === 'volleyball') {
    if (
      actionType === 'kill' ||
      actionType === 'ace' ||
      actionType === 'block' ||
      actionType === 'point_1'
    ) {
      return { scores: true, target: 'own', points: 1 }
    }
    if (
      actionType === 'error' ||
      actionType === 'serve_error' ||
      actionType === 'reception_error'
    ) {
      return { scores: true, target: 'opponent', points: 1 }
    }
  }
  if (sport === 'table-tennis') {
    // `tt_serve` used to award a point, so a scorer logging each serve doubled
    // the score. Serves are no longer a scoring action; a rally is won either
    // outright (winner/ace) or by the opponent's error.
    if (actionType === 'tt_winner' || actionType === 'tt_ace' || actionType === 'point_1') {
      return { scores: true, target: 'own', points: 1 }
    }
    if (actionType === 'tt_error') {
      return { scores: true, target: 'opponent', points: 1 }
    }
  }
  return { scores: false, target: 'own', points: 0 }
}

/** Column for a given period. Returns null for an out-of-range period rather
 *  than clamping — silently folding period 7 into Q4 corrupted the box score. */
function getScoreField(sport: string, period: number): string | null {
  if (!Number.isInteger(period) || period < 1) return null
  return PERIOD_FIELDS[sport]?.[period - 1] ?? null
}

async function aggregateTeamStatsByAction(
  matchId: string,
): Promise<Record<string, Record<string, number>>> {
  const { data: rows } = await supabase
    .from('scoring_actions')
    .select('participant_id, action_type, value')
    .eq('match_id', matchId)
    .eq('undone', false)

  const out: Record<string, Record<string, number>> = {}
  for (const row of rows ?? []) {
    const pid = row.participant_id as string | null | undefined
    if (!pid) continue
    if (!out[pid]) out[pid] = {}
    const k = row.action_type as string
    out[pid][k] = (out[pid][k] ?? 0) + Number(row.value ?? 0)
  }
  return out
}

async function updatePlayerGameStats(
  matchId: string,
  athleteId: string,
  sport: string,
  actionType: string,
  /** +1 to apply the action, -1 to reverse it (undo). */
  direction: 1 | -1 = 1,
) {
  const { data: existing } = await supabase
    .from('player_game_stats')
    .select('stats')
    .eq('match_id', matchId)
    .eq('athlete_id', athleteId)
    .single()

  const contributions = actionTypeToStatKeys(sport, actionType)
  if (contributions.length === 0) return

  const updated = { ...((existing?.stats as Record<string, number>) ?? {}) }
  for (const [key, amount] of contributions) {
    updated[key] = Math.max(0, (updated[key] ?? 0) + amount * direction)
  }

  await supabase
    .from('player_game_stats')
    .upsert(
      { match_id: matchId, athlete_id: athleteId, sport, stats: updated },
      { onConflict: 'match_id,athlete_id' },
    )
}

/** Determine which side won a set/game, given their scores.
 *  Returns 'a' | 'b' | null (null = set still in progress). */
function getSetWinner(sport: string, sA: number, sB: number, period: number): 'a' | 'b' | null {
  if (sport === 'volleyball') {
    const target = period === 5 ? 15 : 25
    const maxS = Math.max(sA, sB)
    const diff = Math.abs(sA - sB)
    if (maxS >= target && diff >= 2) return sA > sB ? 'a' : 'b'
  } else if (sport === 'table-tennis') {
    const maxS = Math.max(sA, sB)
    const diff = Math.abs(sA - sB)
    if (maxS >= 11 && diff >= 2) return sA > sB ? 'a' : 'b'
  }
  return null
}

/** Recompute sets_won / games_won from current period scores and write them back. */
async function recomputePeriodWins(
  matchId: string,
  sport: string,
  participantAId: string,
  participantBId: string,
) {
  const { data: scoresData } = await supabase
    .from('match_scores')
    .select(
      'participant_id, set1, set2, set3, set4, set5, game1, game2, game3, game4, game5, game6, game7',
    )
    .eq('match_id', matchId)

  if (!scoresData || scoresData.length < 2) return

  const sA = scoresData.find((s) => s.participant_id === participantAId)
  const sB = scoresData.find((s) => s.participant_id === participantBId)
  if (!sA || !sB) return

  const periods = PERIOD_FIELDS[sport] ?? []

  let winsA = 0
  let winsB = 0
  for (let i = 0; i < periods.length; i++) {
    const f = periods[i] as string
    const scoreA = Number((sA as Record<string, unknown>)[f] ?? 0)
    const scoreB = Number((sB as Record<string, unknown>)[f] ?? 0)
    const winner = getSetWinner(sport, scoreA, scoreB, i + 1)
    if (winner === 'a') winsA++
    else if (winner === 'b') winsB++
  }

  const wonField = sport === 'volleyball' ? 'sets_won' : 'games_won'
  await Promise.all([
    supabase
      .from('match_scores')
      .update({ [wonField]: winsA })
      .eq('match_id', matchId)
      .eq('participant_id', participantAId),
    supabase
      .from('match_scores')
      .update({ [wonField]: winsB })
      .eq('match_id', matchId)
      .eq('participant_id', participantBId),
  ])
}

/** Warn-only thresholds. Nothing in this file blocks on these — they're
 *  returned to the client so the UI can show a non-blocking warning, per the
 *  house rule that the on-court referee is the authority, not this app. */
const GAME_LIMITS = {
  personalFouls: 5, // FIBA/NCAA/UAAP foul-out threshold
  teamFoulBonus: 5, // team fouls in a quarter that put the opponent in the bonus
  subsPerSet: 6, // volleyball substitutions per team per set (libero exchanges excluded — out of scope)
  timeoutsPerSetVB: 2,
  timeoutsPerMatchTT: 1,
} as const

/** Sport, best_of and table_tennis_format for a match's event, in one query. */
async function getMatchEventInfo(
  matchId: string,
): Promise<{ sport: string; bestOf: number | null; ttFormat: string | null } | null> {
  const { data: m } = await supabase
    .from('matches')
    .select('event_id')
    .eq('id', matchId)
    .maybeSingle()
  if (!m?.event_id) return null
  const { data: e } = await supabase
    .from('events')
    .select('sport, best_of, table_tennis_format')
    .eq('id', m.event_id)
    .maybeSingle()
  if (!e?.sport) return null
  return {
    sport: e.sport,
    bestOf: (e as { best_of?: number | null }).best_of ?? null,
    ttFormat: e.table_tennis_format ?? null,
  }
}

/** Is the match decided, and by whom? Read-only — derives from match_scores,
 *  which recomputePeriodWins already keeps fresh after every action/undo, so
 *  calling this only from /state (never from /action) means an undo that
 *  un-does a clinching point automatically un-decides the match for free. */
function computeMatchDecision(
  sport: string,
  scoreRowA: Record<string, unknown> | undefined,
  scoreRowB: Record<string, unknown> | undefined,
  lockedPeriods: number[],
  bestOf: number | null,
  aId: string | null,
  bId: string | null,
): {
  decided: boolean
  winnerParticipantId: string | null
  winsA: number
  winsB: number
  needsOvertime: boolean
  reason: string
} {
  const empty = {
    decided: false,
    winnerParticipantId: null,
    winsA: 0,
    winsB: 0,
    needsOvertime: false,
    reason: '',
  }
  if (!scoreRowA || !scoreRowB || !aId || !bId) return empty

  if (sport === 'volleyball' || sport === 'table-tennis') {
    const wonField = sport === 'volleyball' ? 'sets_won' : 'games_won'
    const winsA = Number(scoreRowA[wonField] ?? 0)
    const winsB = Number(scoreRowB[wonField] ?? 0)
    const effectiveBestOf = bestOf ?? 5
    const setsToWin = Math.ceil(effectiveBestOf / 2)
    const decided = winsA >= setsToWin || winsB >= setsToWin
    const unit = sport === 'volleyball' ? 'sets' : 'games'
    return {
      decided,
      winnerParticipantId: decided ? (winsA > winsB ? aId : bId) : null,
      winsA,
      winsB,
      needsOvertime: false,
      reason: decided ? `Best of ${effectiveBestOf} — reached ${setsToWin} ${unit}` : '',
    }
  }

  if (sport === 'basketball') {
    const regulationDone = [1, 2, 3, 4].every((p) => lockedPeriods.includes(p))
    if (!regulationDone) return empty
    const totalA = Number(scoreRowA.total ?? 0)
    const totalB = Number(scoreRowB.total ?? 0)
    if (totalA !== totalB) {
      return {
        decided: true,
        winnerParticipantId: totalA > totalB ? aId : bId,
        winsA: totalA,
        winsB: totalB,
        needsOvertime: false,
        reason: 'Regulation/overtime complete',
      }
    }
    return {
      decided: false,
      winnerParticipantId: null,
      winsA: totalA,
      winsB: totalB,
      needsOvertime: true,
      reason: 'Tied after regulation',
    }
  }

  return empty
}

/** Who is serving right now — fully derived, nothing per-rally is stored.
 *  Table tennis: pure arithmetic from the combined score. Volleyball: the
 *  receiving side of the last non-undone SCORING action this period (using
 *  `effect.target`, not the acting participant_id directly — an error awards
 *  the point, and therefore next serve, to the opponent). Falls back to
 *  `first_server_id` alternated by period parity when the period has no
 *  scoring actions yet. */
async function deriveServer(
  matchId: string,
  sport: string,
  period: number,
  firstServerId: string | null,
  scoreRowA: Record<string, unknown> | undefined,
  scoreRowB: Record<string, unknown> | undefined,
  aId: string | null,
  bId: string | null,
): Promise<{
  servingParticipantId: string | null
  source: 'derived' | 'first-server-fallback' | 'unset'
}> {
  if (sport !== 'volleyball' && sport !== 'table-tennis')
    return { servingParticipantId: null, source: 'unset' }
  if (!firstServerId || !aId || !bId) return { servingParticipantId: null, source: 'unset' }

  const otherOf = (id: string) => (id === aId ? bId : aId)
  const periodFirstServer = period % 2 === 1 ? firstServerId : otherOf(firstServerId)

  if (sport === 'table-tennis') {
    const scoreField = getScoreField(sport, period)
    const scoreA = scoreField ? Number(scoreRowA?.[scoreField] ?? 0) : 0
    const scoreB = scoreField ? Number(scoreRowB?.[scoreField] ?? 0) : 0
    const total = scoreA + scoreB
    // Exact because 10-10 can only occur when total === 20 (both sides at 10).
    const serveIndex = total < 20 ? Math.floor(total / 2) : 10 + (total - 20)
    const server = serveIndex % 2 === 0 ? periodFirstServer : otherOf(periodFirstServer)
    return { servingParticipantId: server, source: 'derived' }
  }

  const { data: rows } = await supabase
    .from('scoring_actions')
    .select('action_type, participant_id, sport')
    .eq('match_id', matchId)
    .eq('quarter_or_set', period)
    .eq('undone', false)
    .order('timestamp', { ascending: false })
    .limit(30)

  const lastScoring = (rows ?? []).find(
    (r) => pointEffect(String(r.sport), String(r.action_type)).scores,
  )
  if (!lastScoring)
    return { servingParticipantId: periodFirstServer, source: 'first-server-fallback' }

  const effect = pointEffect(String(lastScoring.sport), String(lastScoring.action_type))
  const actingPid = lastScoring.participant_id as string
  const server = effect.target === 'own' ? actingPid : otherOf(actingPid)
  return { servingParticipantId: server, source: 'derived' }
}

/** Count non-undone rows of one action type by participant, optionally scoped
 *  to a single period. Backs team fouls per quarter, substitutions per set,
 *  and volleyball timeouts per set (period given) / TT timeouts per match
 *  (period null). Legacy rows with a NULL `quarter_or_set` are treated as
 *  period 1 — acceptable since this is warn-only and forward-looking. */
async function countActionsByParticipant(
  matchId: string,
  actionType: string,
  period: number | null,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('scoring_actions')
    .select('participant_id, quarter_or_set')
    .eq('match_id', matchId)
    .eq('action_type', actionType)
    .eq('undone', false)

  const out: Record<string, number> = {}
  for (const row of data ?? []) {
    const pid = (row as { participant_id: string | null }).participant_id
    if (!pid) continue
    if (period !== null) {
      const p = Number((row as { quarter_or_set: number | null }).quarter_or_set ?? 1)
      if (p !== period) continue
    }
    out[pid] = (out[pid] ?? 0) + 1
  }
  return out
}

/** Personal-foul-out — match-cumulative (real foul-out is cumulative across
 *  the whole game, not reset per period), read from the existing per-match
 *  per-athlete stats row. */
async function fouledOutAthletes(matchId: string): Promise<string[]> {
  const { data } = await supabase
    .from('player_game_stats')
    .select('athlete_id, stats')
    .eq('match_id', matchId)
  return (data ?? [])
    .filter(
      (r) =>
        Number((r.stats as Record<string, number> | null)?.fouls ?? 0) >= GAME_LIMITS.personalFouls,
    )
    .map((r) => r.athlete_id as string)
}

// Get match review data (player game stats + scores) for the post-game review
// screen and the match score sheet — shared assembly lives in matchReviewData.ts
// so the score-sheet PDF route (apps/server/src/routes/reports.ts) doesn't have
// to re-implement the roster/stat merge.
router.get('/:matchId/review', requireAuth, requireRole('Organizer', 'Admin'), async (req, res) => {
  const data = await getMatchReviewData(req.params.matchId as string)
  if (!data) return res.status(404).json({ error: 'Match not found' })
  res.json(data)
})

const finalizedMatchesQuerySchema = z.object({
  seasonId: z.string().uuid(),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
})

// List finalized matches for a season+sport — feeds the Analytics "Score Sheets" tab.
// Deliberately lightweight: does NOT call getMatchReviewData per row (that would
// N+1 the roster-merge query across every match in a season).
router.get(
  '/finalized-matches',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const parsed = finalizedMatchesQuerySchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const { seasonId, sport } = parsed.data

    const { data: events } = await supabase
      .from('events')
      .select('id, name')
      .eq('season_id', seasonId)
      .eq('sport', sport)
    const eventMap = new Map((events ?? []).map((e) => [e.id, e.name]))
    if (eventMap.size === 0) return res.json({ matches: [] })

    const { data: matches } = await supabase
      .from('matches')
      .select(
        'id, event_id, bracket_id, participant_a_id, participant_b_id, scheduled_at, venue, finalized_at, scores:match_scores(*)',
      )
      .in('event_id', [...eventMap.keys()])
      .eq('status', 'completed')
      .not('finalized_at', 'is', null)
      .order('finalized_at', { ascending: false })
      .limit(100)

    const bracketIds = [
      ...new Set((matches ?? []).map((m) => m.bracket_id).filter(Boolean)),
    ] as string[]
    const { data: brackets } = bracketIds.length
      ? await supabase
          .from('brackets')
          .select('id, round, bracket_type, winner_id')
          .in('id', bracketIds)
      : { data: [] }
    const bracketMap = new Map((brackets ?? []).map((b) => [b.id, b]))

    const ids = new Set<string>()
    for (const m of matches ?? []) {
      if (m.participant_a_id) ids.add(m.participant_a_id)
      if (m.participant_b_id) ids.add(m.participant_b_id)
    }
    const labelMap = await resolveParticipantLabelMap([...ids])

    const rows = (matches ?? []).map((m) => {
      const bracket = m.bracket_id ? bracketMap.get(m.bracket_id) : null
      const scores = (m as { scores?: Array<Record<string, unknown>> }).scores ?? []
      const scoreA = scores.find((s) => s.participant_id === m.participant_a_id)
      const scoreB = scores.find((s) => s.participant_id === m.participant_b_id)
      return {
        matchId: m.id,
        eventId: m.event_id,
        eventName: eventMap.get(m.event_id) ?? '',
        round: bracket?.round ?? null,
        bracketType: bracket?.bracket_type ?? null,
        scheduledAt: m.scheduled_at,
        venue: m.venue,
        finalizedAt: m.finalized_at,
        nameA: m.participant_a_id ? (labelMap[m.participant_a_id] ?? '—') : '—',
        nameB: m.participant_b_id ? (labelMap[m.participant_b_id] ?? '—') : '—',
        finalScoreLabel: summarizeFinalScore(sport, scoreA, scoreB),
        winnerName: bracket?.winner_id ? (labelMap[bracket.winner_id] ?? null) : null,
      }
    })
    res.json({ matches: rows })
  },
)

// Generous single-match ceilings, not real game-rule enforcement — just
// enough to catch a fat-fingered edit (e.g. "500" for total_points) that
// z.number().min(0) alone can't. Keys not listed here are left unbounded,
// matching the route's existing permissive behavior for anything unknown.
const STAT_MAX_BOUNDS: Record<string, Record<string, number>> = {
  basketball: {
    total_points: 150,
    fg_made: 100,
    fg_attempted: 100,
    three_made: 100,
    three_attempted: 100,
    ft_made: 100,
    ft_attempted: 100,
    total_rebounds: 60,
    off_rebounds: 60,
    total_assists: 30,
    total_steals: 30,
    total_blocks: 30,
    turnovers: 20,
    fouls: 20,
  },
  volleyball: {
    pts_scored: 80,
    kills: 80,
    attacks: 80,
    aces: 40,
    digs: 80,
    blocks: 40,
    assists: 80,
    errors: 40,
    serve_errors: 40,
    reception_errors: 40,
  },
  'table-tennis': {
    pts_scored: 80,
    winners: 80,
    aces: 80,
    errors: 80,
  },
}

// Update a player's game stats (for post-game editing)
router.patch(
  '/:matchId/player-stats/:athleteId',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const { matchId, athleteId } = req.params
    const schema = z.object({
      stats: z.record(z.string(), z.number().finite().min(0)),
      // Why the record is being changed. Required so the audit trail explains
      // itself; the review UI collects it before saving.
      reason: z.string().trim().min(3).max(500),
      // Set once the organizer has confirmed past a stat_diverged_from_live
      // warning — a legitimate correction (e.g. a misattributed basket) will
      // often genuinely differ from what was logged live.
      confirmOverride: z.boolean().optional(),
    })

    try {
      const { stats, reason, confirmOverride } = schema.parse(req.body)

      const { data: mrow } = await supabase
        .from('matches')
        .select('event_id, status, participant_a_id, participant_b_id')
        .eq('id', matchId)
        .maybeSingle()
      if (!mrow?.event_id) return res.status(404).json({ error: 'Match not found' })

      // Only a finished match may be corrected. Editing a live match raced the
      // scorer, whose next action would read-modify-write on top of the edit.
      if (mrow.status !== 'completed') {
        return res
          .status(400)
          .json({ error: 'Only a completed match can have its stats corrected' })
      }

      const { data: evt } = await supabase
        .from('events')
        .select('sport, season_id, status')
        .eq('id', mrow.event_id)
        .maybeSingle()
      if (!evt?.sport) return res.status(404).json({ error: 'Event not found' })

      // Confine an organizer to their assigned sports, as every other write
      // router already does. Without this a basketball-only organizer could
      // rewrite volleyball box scores.
      if (await respondIfSportForbidden(req, res, evt.sport)) return

      // Hard reject implausible single-match values.
      const bounds = STAT_MAX_BOUNDS[evt.sport] ?? {}
      for (const [key, value] of Object.entries(stats)) {
        const max = bounds[key]
        if (max != null && value > max) {
          return res.status(400).json({
            error: `${key} of ${value} exceeds the plausible single-match maximum (${max})`,
          })
        }
      }

      // Soft block: this is the same "differs from what was actually logged
      // live" signal MatchReview.tsx already shows per-cell as advisory-only
      // (amber border + "live: X") — upgraded to a real confirm-before-save
      // step here, since a genuine correction (e.g. a misattributed basket)
      // is a legitimate reason to diverge from the live-tracked value.
      if (!confirmOverride) {
        const reviewData = await getMatchReviewData(matchId as string)
        const live = reviewData?.liveStats?.[athleteId as string] ?? {}
        const diverged = Object.keys(stats).filter((key) => Number(live[key] ?? 0) !== stats[key])
        if (diverged.length > 0) {
          return res.status(409).json({
            error: 'stat_diverged_from_live',
            message: `${diverged.join(', ')} ${diverged.length === 1 ? 'differs' : 'differ'} from what was recorded live for this player.`,
            diverged,
          })
        }
      }

      // An archived season is a closed book.
      if (evt.season_id) {
        const { data: season } = await supabase
          .from('seasons')
          .select('status')
          .eq('id', evt.season_id)
          .maybeSingle()
        if (season?.status === 'archived') {
          return res
            .status(409)
            .json({ error: 'This season is archived and its results can no longer be edited' })
        }
      }

      // The athlete must actually have played in this match.
      const onA = mrow.participant_a_id
        ? await isAthleteOnParticipant(mrow.participant_a_id, athleteId as string)
        : false
      const onB =
        !onA && mrow.participant_b_id
          ? await isAthleteOnParticipant(mrow.participant_b_id, athleteId as string)
          : false
      if (!onA && !onB) {
        return res.status(400).json({ error: 'That athlete did not play in this match' })
      }

      // Capture the previous values so the audit entry is a real diff.
      const { data: prevRow } = await supabase
        .from('player_game_stats')
        .select('stats')
        .eq('match_id', matchId)
        .eq('athlete_id', athleteId)
        .maybeSingle()
      const before = (prevRow?.stats as Record<string, number>) ?? {}

      const changed: Record<string, { from: number; to: number }> = {}
      for (const key of new Set([...Object.keys(before), ...Object.keys(stats)])) {
        const from = Number(before[key] ?? 0)
        const to = Number(stats[key] ?? 0)
        if (from !== to) changed[key] = { from, to }
      }

      if (Object.keys(changed).length === 0) {
        return res.json({ success: true, unchanged: true })
      }

      const { error } = await supabase.from('player_game_stats').upsert(
        {
          match_id: matchId,
          athlete_id: athleteId,
          sport: evt.sport,
          stats,
        },
        { onConflict: 'match_id,athlete_id' },
      )

      if (error) return res.status(400).json({ error: error.message })

      // Keep season aggregates in step with the correction. Previously only the
      // separate /finalize call did this, so "Save changes" alone left an
      // athlete's season totals permanently disagreeing with their game log.
      if (evt.season_id) {
        await supabase.rpc('recompute_player_season_stats', {
          p_athlete_id: athleteId,
          p_season_id: evt.season_id,
        })
        void computeInsightsForMatch(matchId as string, evt.season_id).catch((e) =>
          console.error('[insights] stat-edit recomputation failed:', e),
        )
      }

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_player_stats_updated',
        entityType: 'match',
        entityId: matchId,
        details: { athlete_id: athleteId, reason, changed },
      })
      res.json({ success: true, changed })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed'
      res.status(400).json({ error: message })
    }
  },
)

// Finalize match — refresh player season totals after post-game stat edits (team standings were applied when the match ended)
router.post(
  '/:matchId/finalize',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string
    const schema = z.object({ winnerId: z.string().uuid() })

    try {
      const { winnerId } = schema.parse(req.body)

      const { data: match } = await supabase
        .from('matches')
        .select('participant_a_id, participant_b_id, event_id, status')
        .eq('id', matchId)
        .single()
      if (!match) return res.status(404).json({ error: 'Match not found' })
      if (match.status !== 'completed') {
        return res.status(400).json({ error: 'Only a completed match can be finalized' })
      }
      if (winnerId !== match.participant_a_id && winnerId !== match.participant_b_id) {
        return res.status(400).json({ error: 'Winner must be one of this match’s participants' })
      }

      const { data: event } = await supabase
        .from('events')
        .select('season_id, sport')
        .eq('id', match.event_id)
        .single()
      if (!event) return res.status(404).json({ error: 'Event not found' })
      if (await respondIfSportForbidden(req, res, event.sport)) return

      const seasonId = event.season_id

      await recomputePlayerSeasonStatsForMatch(matchId)

      void computeInsightsForMatch(matchId, seasonId).catch((e) =>
        console.error('Insights computation failed:', e),
      )

      await writeAuditLog({
        actorId: req.user!.id,
        action: 'match_stats_finalized',
        entityType: 'match',
        entityId: matchId,
        details: { winner_id: winnerId, event_id: match.event_id },
      })

      // Persisted so a later page load (or any other endpoint) can tell this match
      // was finalized — previously nothing on the matches row recorded this, only
      // an audit_logs entry and a component-local React flag that reset on reload.
      await supabase
        .from('matches')
        .update({ finalized_at: new Date().toISOString() })
        .eq('id', matchId)

      res.json({ success: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Finalize failed'
      res.status(400).json({ error: message })
    }
  },
)

// Sub/swap a player in the active lineup during a live match
// Body: { side: 'a' | 'b', outAthleteId: uuid, inAthleteId: uuid }
router.patch(
  '/:matchId/lineup',
  requireAuth,
  requireRole('Organizer', 'Admin'),
  async (req: AuthRequest, res) => {
    const matchId = req.params.matchId as string

    const bodyParse = z
      .object({
        side: z.enum(['a', 'b']),
        outAthleteId: z.string().uuid(),
        inAthleteId: z.string().uuid(),
      })
      .safeParse(req.body)

    if (!bodyParse.success) return res.status(400).json({ error: 'Invalid body' })

    const { side, outAthleteId, inAthleteId } = bodyParse.data

    const { data: match } = await supabase
      .from('matches')
      .select(
        'status, active_lineup, participant_a_id, participant_b_id, event_id, scoring_locked_by, current_period',
      )
      .eq('id', matchId)
      .single()

    if (!match) return res.status(404).json({ error: 'Match not found' })
    if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })
    // Every other live-match write endpoint requires the scoring lock; this one
    // didn't, so any organizer could sub for either side of any live match.
    if (match.scoring_locked_by !== req.user!.id) {
      return res.status(403).json({ error: 'You do not have scoring lock for this match' })
    }

    const lineupSport = await getMatchSport(matchId)
    if (await respondIfSportForbidden(req, res, lineupSport)) return

    const teamId = side === 'a' ? match.participant_a_id : match.participant_b_id
    if (!teamId) return res.status(400).json({ error: 'Participant not set' })

    // Validate both athletes are on the team's roster
    const { data: members } = await supabase
      .from('team_members')
      .select('athlete_id')
      .eq('team_id', teamId)
      .in('athlete_id', [outAthleteId, inAthleteId])

    const memberIds = new Set(
      ((members ?? []) as Array<{ athlete_id: string | null }>).map((m) => m.athlete_id),
    )
    if (!memberIds.has(outAthleteId))
      return res.status(400).json({ error: 'outAthleteId is not on this team' })
    if (!memberIds.has(inAthleteId))
      return res.status(400).json({ error: 'inAthleteId is not on this team' })

    const currentLineup = (match.active_lineup as Record<string, string[]> | null) ?? {
      a: [],
      b: [],
    }
    const sideList = [...(currentLineup[side] ?? [])]

    const idx = sideList.indexOf(outAthleteId)
    if (idx === -1)
      return res.status(400).json({ error: 'outAthleteId is not currently active on this side' })
    if (sideList.includes(inAthleteId))
      return res.status(400).json({ error: 'inAthleteId is already active' })

    sideList[idx] = inAthleteId
    const newLineup = { ...currentLineup, [side]: sideList }

    await supabase.from('matches').update({ active_lineup: newLineup }).eq('id', matchId)

    // A substitution used to be recorded only in audit_logs — invisible to
    // /state, uncounted, and with no period. Give it a scoring_actions row (no
    // athlete_id: the in/out detail already lives in the audit log below; this
    // row only needs to be countable per team per set) so subsUsed/:matchId/state
    // can report it and the Phase B index can count it cheaply.
    const sport = await getMatchSport(matchId)
    if (sport) {
      await supabase.from('scoring_actions').insert({
        match_id: matchId,
        participant_id: teamId,
        athlete_id: null,
        sport,
        action_type: 'substitution',
        value: 1,
        quarter_or_set: Number(match.current_period ?? 1),
        recorded_by: req.user!.id,
      })
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_live_lineup_swapped',
      entityType: 'match',
      entityId: matchId,
      details: {
        event_id: match.event_id,
        side,
        out_athlete_id: outAthleteId,
        in_athlete_id: inAthleteId,
      },
    })

    res.json({ success: true, activeLineup: newLineup })
  },
)

export default router
