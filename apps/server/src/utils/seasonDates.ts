/**
 * Season date validation, shared by POST /admin/seasons and PATCH /admin/seasons/:id.
 *
 * Dates are compared as YYYY-MM-DD strings, never `Date` objects. `new
 * Date('2026-08-14')` is UTC midnight, which is the PREVIOUS day in UTC-8 — a
 * UTC-clock server would reject a valid same-day Manila start for eight hours
 * daily. ISO strings compare correctly with plain `<`/`>=`.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today in Asia/Manila as YYYY-MM-DD — pinned to the school's timezone, not the server's. */
export function todayManila(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

export type SeasonDateValidation = { ok: true } | { ok: false; error: string }

/**
 * `mode: 'create'` always rejects a past start date. `mode: 'edit'` rejects a
 * start date only when it is MOVING into the past — an already-running
 * season's historical start date (a true fact) must stay saveable, or the
 * season becomes permanently uneditable the day after it starts.
 */
export function validateSeasonDates(
  next: { start_date?: string | null; end_date?: string | null },
  opts: { mode: 'create' | 'edit'; storedStartDate?: string | null },
): SeasonDateValidation {
  const startDate = next.start_date ?? null
  const endDate = next.end_date ?? null

  if (startDate != null && !DATE_RE.test(startDate)) {
    return { ok: false, error: 'Start date must be in YYYY-MM-DD format.' }
  }
  if (endDate != null && !DATE_RE.test(endDate)) {
    return { ok: false, error: 'End date must be in YYYY-MM-DD format.' }
  }

  if (startDate != null && endDate != null && endDate <= startDate) {
    return { ok: false, error: 'The end date must be after the start date.' }
  }

  if (startDate != null) {
    const storedHasStarted =
      opts.mode === 'edit' &&
      opts.storedStartDate != null &&
      DATE_RE.test(opts.storedStartDate) &&
      opts.storedStartDate < todayManila()

    if (!storedHasStarted && startDate < todayManila()) {
      return { ok: false, error: 'A season cannot start in the past. Pick today or a later date.' }
    }
  }

  return { ok: true }
}
