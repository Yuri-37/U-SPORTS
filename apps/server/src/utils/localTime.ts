/**
 * The institution runs on Philippine Standard Time: UTC+8 all year, no DST.
 * Used ONLY to interpret a timestamp that arrives with no zone at all.
 */
export const INSTITUTION_UTC_OFFSET = '+08:00'

/**
 * Turns an announcement date/time into an unambiguous UTC instant.
 *
 * The web app now sends a full ISO string (the browser knows its own zone, so
 * it converts before sending). A zone-less `YYYY-MM-DDTHH:mm` -- what an
 * HTML datetime-local input produces, and what older cached web bundles still
 * send -- used to go through `new Date(...)`, which reads it in the SERVER's
 * timezone. Render runs UTC, so "2:00 PM" typed in Manila was stored as
 * 14:00 UTC, i.e. 10:00 PM Manila: every expiry ran 8 hours late, and a
 * rescheduled match was moved 8 hours later than the organizer picked.
 *
 * A zone-less value is therefore pinned to the institution's offset rather
 * than to wherever the server happens to run.
 */
export function localDatetimeStringToIso(input: string): string {
  const trimmed = input.trim()
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed
  const hasZone = /T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/i.test(withSeconds)
  const d = new Date(hasZone ? withSeconds : `${withSeconds}${INSTITUTION_UTC_OFFSET}`)
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date and time')
  return d.toISOString()
}
