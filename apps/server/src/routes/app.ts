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
/**
 * Fallback when the GitHub API refuses us (unauthenticated calls from a shared
 * host IP hit its rate limit): github.com/<repo>/releases/latest answers with a
 * redirect to .../releases/tag/vX.Y.Z, and that page is not rate limited.
 */
async function latestVersionFromRedirect(): Promise<string | null> {
  const res = await fetch(`https://github.com/${REPO}/releases/latest`, {
    headers: { 'User-Agent': 'u-sports-api' },
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
  const tag = (res.headers.get('location') ?? '').split('/tag/')[1] ?? ''
  return decodeURIComponent(tag).replace(/^v/i, '').trim() || null
}

async function latestVersion(): Promise<string | null> {
  const override = process.env.APP_LATEST_VERSION?.trim()
  if (override) return override
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.version
  try {
    let version: string | null
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { 'User-Agent': 'u-sports-api', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      const body = (await res.json()) as { tag_name?: string }
      version = (body.tag_name ?? '').replace(/^v/i, '').trim() || null
    } catch (apiError) {
      console.warn('[app] GitHub API lookup failed, trying the releases redirect:', (apiError as Error).message)
      version = await latestVersionFromRedirect()
    }
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
