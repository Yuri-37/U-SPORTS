import { Pool } from 'pg'

let pool: Pool | null = null

/**
 * Explicit URI wins. Otherwise, when SUPABASE_URL is local CLI Supabase (API :54321),
 * derive Postgres URI (:54322) — users often only set the Studio/API URL.
 */
export function resolveDirectPgConnectionString(): string | null {
  const explicit =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim()
  if (explicit) return explicit

  const apiUrl = process.env.SUPABASE_URL?.trim()
  if (!apiUrl) return null

  try {
    const u = new URL(apiUrl)
    const host = u.hostname
    const apiPort = u.port || (u.protocol === 'https:' ? '443' : '80')

    // Local `supabase start`: Kong/API on 54321, Postgres on 54322 (see supabase/config.toml)
    if ((host === '127.0.0.1' || host === 'localhost') && apiPort === '54321') {
      const pw = process.env.SUPABASE_DB_PASSWORD ?? 'postgres'
      const dbPort = process.env.SUPABASE_DB_PORT ?? '54322'
      return `postgresql://postgres:${encodeURIComponent(pw)}@${host}:${dbPort}/postgres`
    }
  } catch {
    return null
  }

  return null
}

function pgUrlHost(conn: string): string | null {
  const m = conn.match(/^postgres(?:ql)?:\/\/(?:[^@]*@)?([^:/]+)/i)
  return m?.[1] ?? null
}

function getPool(): Pool | null {
  const url = resolveDirectPgConnectionString()
  if (!url) return null
  if (!pool) {
    const host = pgUrlHost(url) ?? ''
    const isLocalHost = host === '127.0.0.1' || host === 'localhost'

    pool = new Pool({
      connectionString: url,
      ssl: isLocalHost ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
    })
  }
  return pool
}

export async function directPgQuery(
  sql: string,
  values: unknown[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const p = getPool()
  if (!p) return { ok: false, message: 'NO_DIRECT_PG' }
  try {
    await p.query(sql, values)
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : 'Direct PG query failed' }
  }
}

export function hasDirectPg(): boolean {
  return resolveDirectPgConnectionString() !== null
}
