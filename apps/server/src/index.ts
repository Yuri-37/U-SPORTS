import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

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
import { bootstrapDefaultAdmin } from './utils/bootstrapAdmin'

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(helmet())
app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser clients (curl/postman) without Origin header
    if (!origin) return cb(null, true)

    const configured = process.env.WEB_URL?.trim()
    if (configured && origin === configured) return cb(null, true)

    // Dev convenience: allow any localhost port (Vite may choose a new port).
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/localhost:\d+$/.test(origin) || /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
        return cb(null, true)
      }
    }

    return cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Rate limiting (high ceiling in dev — Live Scoring + realtime can spike GET /state)
const apiRateLimitMax =
  process.env.NODE_ENV === 'production'
    ? 300
    : Number(process.env.API_RATE_LIMIT_MAX) > 0
      ? Number(process.env.API_RATE_LIMIT_MAX)
      : 10_000

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiRateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
})
app.use('/api/', limiter)

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app
  .listen(PORT, () => {
    console.log(`U-Sports API running on http://localhost:${PORT}`)
    bootstrapDefaultAdmin().catch((err) => console.error('[bootstrap] Unexpected error:', err))
  })
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Another API instance is probably running (e.g. from \`pnpm dev\`). Stop it or set PORT in apps/server/.env.`
      )
    } else {
      console.error(err)
    }
    process.exit(1)
  })

export default app
