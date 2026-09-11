import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

// Terminal error middleware. Every handler registered through createRouter()
// (utils/asyncRouter.ts) forwards its throws and rejections here.
export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
  console.error(err.stack)
  // Headers already out means a response was mid-stream (the PDF reports pipe
  // straight into res). Nothing can be sent now, and returning here would
  // leave the download hanging open forever; Express's default handler
  // destroys the socket so the client sees a failed download instead.
  if (res.headersSent) return next(err)

  // Zod validation errors reaching here mean a handler parsed without its own
  // try/catch. That is a bad request, not a server fault -- reporting it as
  // 500 sends the caller chasing an outage instead of fixing their payload.
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
  }

  // body-parser attaches a status (400 for malformed JSON, 413 for a body over
  // the limit) and so do several middlewares. Reporting those as 500 tells the
  // caller the server broke when in fact their request did.
  const httpErr = err as { status?: number; statusCode?: number; type?: string }
  const status = httpErr.status ?? httpErr.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return res.status(status).json({
      error:
        httpErr.type === 'entity.parse.failed'
          ? 'Malformed request body'
          : err.message || 'Request rejected',
    })
  }

  res.status(500).json({ error: 'Internal server error' })
}
