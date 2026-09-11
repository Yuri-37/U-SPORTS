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
import rateLimit from 'express-rate-limit'
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

// Rate limiting (high ceiling in dev — Live Scoring + realtime can spike GET /state)
const apiRateLimitMax =
  process.env.NODE_ENV === 'production'
    ? 300
    : Number(process.env.API_RATE_LIMIT_MAX) > 0
      ? Number(process.env.API_RATE_LIMIT_MAX)
      : 10_000

// Pure per-IP keying is wrong for this deployment: a campus sits behind one
// public NAT address, so every student and organizer on school wifi would
// share a single budget, and live scoring exhausts it on match day. Signed-in
// requests are therefore keyed per session, anonymous ones per IP.
//
// The WHOLE token is hashed. A prefix is not enough: a JWT opens with its
// header, which is identical for every user of the project (same alg, kid,
// typ), followed by the fixed "iss" claim -- keying on the first few dozen
// characters put every signed-in user into one shared bucket.
function sessionOrIpKey(req: express.Request): string {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ') && auth.length > 7) {
    return 'tok:' + createHash('sha256').update(auth.slice(7)).digest('base64url')
  }
  return 'ip:' + (req.ip ?? 'unknown')
}

// Per-session keys alone let one host dodge the limit by sending a fresh junk
// token with every request, and each of those still costs an auth round trip
// before it is rejected. This per-IP ceiling bounds that. It sits far above
// the per-session budget so a campus sharing one address is not throttled by
// it in normal use; raise API_IP_RATE_LIMIT_MAX if a large event ever does.
const apiIpRateLimitMax =
  Number(process.env.API_IP_RATE_LIMIT_MAX) > 0
    ? Number(process.env.API_IP_RATE_LIMIT_MAX)
    : process.env.NODE_ENV === 'production'
      ? 10_000
      : 100_000

const ipCeiling = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiIpRateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
})

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiRateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: sessionOrIpKey,
})
app.use('/api/', ipCeiling, limiter)

// Stricter limit for auth endpoints. Both routes behind it require a session
// (change-password, accept-privacy-notice), so this is per session too: per
// IP, the 21st athlete on campus wifi to accept the privacy notice on
// onboarding day would be locked out of the app for 15 minutes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: sessionOrIpKey,
})
app.use('/api/auth/', authLimiter)

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

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
