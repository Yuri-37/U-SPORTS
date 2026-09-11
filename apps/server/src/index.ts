import 'dotenv/config'

// Last line of defence. createRouter() (utils/asyncRouter.ts) routes handler
// rejections into the error middleware, so these should never fire for route
// code -- but a rejection from a timer, an event emitter or a floating
// promise elsewhere would otherwise terminate the process under Node's
// default policy, taking the API down for every user. Log and keep serving;
// a single bad request is not a reason to drop every in-flight one.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})
import { createHash } from 'crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit, { type Options, type RateLimitInfo } from 'express-rate-limit'
import { errorHandler } from './middleware/errorHandler'

import authRouter from './routes/auth'
import eventsRouter from './routes/events'
import bracketsRouter from './routes/brackets'
import scoringRouter from './routes/scoring'
import athletesRouter from './routes/athletes'
import teamsRouter from './routes/teams'
import insightsRouter from './routes/insights'
import announcementsRouter from './routes/announcements'
import reportsRouter from './routes/reports'
import adminRouter from './routes/admin'
import studentsRouter from './routes/students'
import participantsRouter from './routes/participants'
import notificationsRouter from './routes/notifications'
import profileRouter from './routes/profile'
import seasonSetupRouter from './routes/season-setup'
import { bootstrapDefaultAdmin } from './utils/bootstrapAdmin'

const app = express()
const PORT = process.env.PORT || 3001

// Render sits in front of this app as a single reverse proxy hop — trust
// exactly that one hop so req.ip resolves from X-Forwarded-For correctly.
// Without this, express-rate-limit refuses to trust the header at all and
// throws on every request (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR), crashing
// the process since Render always sets this header.
app.set('trust proxy', 1)

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (curl/postman) without Origin header
      if (!origin) return cb(null, true)

      const configured = process.env.WEB_URL?.trim()
      if (configured && origin === configured) return cb(null, true)

      // Dev convenience: allow any localhost port (Vite may choose a new port).
      if (process.env.NODE_ENV !== 'production') {
        if (
          /^https?:\/\/localhost:\d+$/.test(origin) ||
          /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)
        ) {
          return cb(null, true)
        }
      }

      return cb(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── Rate limiting ────────────────────────────────────────────────────────────
//
// Sized from what the apps actually send, not guessed. Measured against the
// real stack: one scoring action fans out into 5 realtime events, and every
// open mobile live screen reloads through this API once per event, on top of
// fixed polling (GET /scoring/:id/state every 2.5s while the match screen is
// open; GET /events/:id/matches every 2s while any match in the event is
// live). A phone following a fully stat-tracked game therefore sends roughly
// 1,300-2,600 requests per 15 minutes. The old per-account budget of 300 was
// spent within a few minutes of live play.
//
// Both limits are tunable from the environment in every mode (production used
// to ignore API_RATE_LIMIT_MAX entirely), and the first rejection per key per
// window is logged, so a limit that bites shows up in the Render logs instead
// of as unexplained "Too many requests" on students' phones.
const WINDOW_MS = 15 * 60 * 1000
const isProduction = process.env.NODE_ENV === 'production'
const envLimit = (name: string): number | undefined => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Per signed-in session: ~2x the heaviest client measured above.
const apiRateLimitMax = envLimit('API_RATE_LIMIT_MAX') ?? (isProduction ? 5_000 : 10_000)

// Per IP, all traffic. A campus sits behind one public NAT address, so this
// has to carry everyone on school wifi at once -- 100,000 covers ~40 phones
// following live games simultaneously. Its job is to stop a single host from
// dodging the per-session limit with a fresh junk token on every request;
// anonymous traffic (guests on public pages) is bounded by this alone, since
// such a host would get exactly this budget anyway.
const apiIpRateLimitMax = envLimit('API_IP_RATE_LIMIT_MAX') ?? (isProduction ? 100_000 : 1_000_000)

function bearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization
  return auth?.startsWith('Bearer ') && auth.length > 7 ? auth.slice(7) : null
}

// The WHOLE token is hashed. A prefix is not enough: a JWT opens with its
// header, which is identical for every user of the project (same alg, kid,
// typ), followed by the fixed "iss" claim -- keying on the first few dozen
// characters put every signed-in user into one shared bucket.
function sessionOrIpKey(req: express.Request): string {
  const token = bearerToken(req)
  if (token) return 'tok:' + createHash('sha256').update(token).digest('base64url')
  return 'ip:' + (req.ip ?? 'unknown')
}

// Names what the limiter actually counts. Limits run before authentication,
// so a token here is unverified -- never call it "signed in", and never log it.
function rejectAndLog(name: string, keyedBy: 'ip' | 'session-or-ip'): Options['handler'] {
  return (req, res, _next, options) => {
    const info = (req as express.Request & { rateLimit?: RateLimitInfo }).rateLimit
    if (info && info.used === info.limit + 1) {
      const who =
        keyedBy === 'session-or-ip' && bearerToken(req) ? 'one session token' : `ip ${req.ip}`
      const path = req.originalUrl.split('?')[0]
      console.warn(
        `[rate-limit] ${name} (${info.limit}/15min) reached by ${who} at ${req.method} ${path}`,
      )
    }
    res.status(options.statusCode).json(options.message)
  }
}

const tooMany = { error: 'Too many requests, please try again later.' }

const ipCeiling = rateLimit({
  windowMs: WINDOW_MS,
  max: apiIpRateLimitMax,
  message: tooMany,
  handler: rejectAndLog('per-IP ceiling', 'ip'),
})

const sessionLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: apiRateLimitMax,
  message: tooMany,
  keyGenerator: sessionOrIpKey,
  skip: (req) => !bearerToken(req),
  handler: rejectAndLog('per-session limit', 'session-or-ip'),
})
app.use('/api/', ipCeiling, sessionLimiter)

// Stricter limit for auth endpoints. Both routes behind it require a session
// (change-password, accept-privacy-notice), so this is per session too: per
// IP, the 21st athlete on campus wifi to accept the privacy notice on
// onboarding day would be locked out of the app for 15 minutes.
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 20,
  message: tooMany,
  keyGenerator: sessionOrIpKey,
  handler: rejectAndLog('auth limit', 'session-or-ip'),
})
app.use('/api/auth/', authLimiter)

// Health check. `commit` answers "is my fix actually live?" with a plain GET:
// Render sets RENDER_GIT_COMMIT on every deploy, and it never reports to
// GitHub, so without this the only way to tell was to probe behaviour. The
// repo is public, so the hash reveals nothing. Null when run locally.
app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
  }),
)

// Routes
app.use('/api/auth', authRouter)
app.use('/api/events', eventsRouter)
app.use('/api/brackets', bracketsRouter)
app.use('/api/scoring', scoringRouter)
app.use('/api/athletes', athletesRouter)
app.use('/api/teams', teamsRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/announcements', announcementsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/students', studentsRouter)
app.use('/api/participants', participantsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/profile', profileRouter)
app.use('/api/season-setup', seasonSetupRouter)

// Friendly root — API has no HTML; avoids "is the server broken?" confusion
app.get('/', (_req, res) => {
  res.json({
    name: 'U-Sports API',
    health: '/health',
    api: '/api',
  })
})

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use(errorHandler)

app
  .listen(PORT, () => {
    console.log(`U-Sports API running on http://localhost:${PORT}`)
    bootstrapDefaultAdmin().catch((err) => console.error('[bootstrap] Unexpected error:', err))
  })
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Another API instance is probably running (e.g. from \`pnpm dev\`). Stop it or set PORT in apps/server/.env.`,
      )
    } else {
      console.error(err)
    }
    process.exit(1)
  })

export default app
