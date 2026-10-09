import { createRouter } from '../utils/asyncRouter'

const router = createRouter()

const REPO = 'Yuri-37/U-SPORTS'
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/U-Sports.apk`
const CACHE_MS = 10 * 60 * 1000

let cached: { at: number; version: string | null } | null = null

/**
 * The newest published Android version, so an installed app can tell its user
 * a newer one exists. Read from the latest GitHub release (the same place the
 * download link points at) and cached, so a phone opening the app never makes
 * the server call GitHub more than once per ten minutes. APP_LATEST_VERSION
 * overrides it (and is how this is tested).
 */
async function latestVersion(): Promise<string | null> {
  const override = process.env.APP_LATEST_VERSION?.trim()
  if (override) return override
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.version
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'u-sports-api', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const body = (await res.json()) as { tag_name?: string }
    const version = (body.tag_name ?? '').replace(/^v/i, '').trim() || null
    cached = { at: Date.now(), version }
    return version
  } catch (e) {
    console.warn('[app] latest version lookup failed:', (e as Error).message)
    // Keep serving the last good answer rather than flapping to "unknown".
    cached = { at: Date.now() - CACHE_MS + 60_000, version: cached?.version ?? null }
    return cached.version
  }
}

router.get('/latest', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json({ latest: await latestVersion(), download_url: DOWNLOAD_URL })
})

export default router
