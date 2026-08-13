/**
 * Season date validation — client-side copy of
 * apps/server/src/utils/seasonDates.ts. There's no shared package between
 * apps/web and apps/server (pnpm-workspace.yaml only globs apps/*), so this
 * mirrors the server predicate the same way apps/web/src/lib/validation/forms.ts
 * already duplicates admin.ts's zod rules. The server is the actual gate;
 * this only avoids a round-trip for the common case.
 *
 * Dates are compared as YYYY-MM-DD strings, never `Date` objects — see the
 * server copy's header for why.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today in Asia/Manila as YYYY-MM-DD — matches the server's timezone pin. */
export function todayManila(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

export type SeasonDateValidation = { ok: true } | { ok: false; error: string }

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
