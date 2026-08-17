/**
 * Slugs are generated once at creation and never change, even if the event
 * is later renamed. There is no DB default/trigger for this — `events.slug`
 * is NOT NULL UNIQUE, so every insert path (the create route, the reseed
 * script, the placeholder generator) must call this before inserting.
 */
export function slugifyEventName(name: string, id: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base}-${id.replace(/-/g, '').slice(-6)}`
}
