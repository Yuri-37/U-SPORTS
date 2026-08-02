const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

/** Make logo URLs load when DB stores a path or protocol-relative URL. */
export function resolveInstitutionLogoUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = raw.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('//')) return `https:${t}`
  if (!supabaseUrl) return t
  return t.startsWith('/') ? `${supabaseUrl}${t}` : `${supabaseUrl}/${t}`
}
