import { ZodError } from 'zod'

/**
 * One readable sentence for a caught error, fit to send straight to the UI.
 *
 * A route that validates with `schema.parse(req.body)` throws a ZodError on
 * bad input. `ZodError.message` is NOT a sentence -- it's `JSON.stringify`
 * of the whole issues array -- so every catch block written as
 * `err instanceof Error ? err.message : fallback` sent that raw JSON straight
 * to the client. Creating a season with no name, for example, showed
 * `[{"code":"too_small",...,"message":"Season name is required","path":["name"]}]`
 * instead of "Season name is required".
 */
export function describeCaughtError(err: unknown, fallback: string): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? fallback
  if (err instanceof Error) return err.message
  return fallback
}
