import { Router, type RequestHandler, type IRouter } from 'express'

/**
 * Express 4 does not forward a rejected promise from an `async` route handler
 * to the error middleware. The rejection escapes as an unhandled promise
 * rejection, which means two things at once:
 *
 *   1. No response is ever written -- the client hangs until it times out,
 *      which looks identical to the API being asleep.
 *   2. Under Node 15+ the default policy for an unhandled rejection is to
 *      terminate the process, so one malformed request takes the API down
 *      for everyone.
 *
 * Most handlers here wrap their body in try/catch, but not all of them, and
 * "remember the try/catch" is not a property you can enforce by review. A
 * bare `schema.parse(req.body)` in an async handler was enough to kill the
 * server (PATCH /athletes/:id/season-status).
 *
 * createRouter() returns a Router whose method registrations wrap every
 * handler so both synchronous throws and promise rejections reach next(),
 * and therefore the error middleware in index.ts. Route files use this
 * instead of Router() directly; the behaviour is otherwise identical.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'] as const

function wrapHandler(handler: RequestHandler): RequestHandler {
  // Arity 4 means (err, req, res, next) -- error middleware, not a route
  // handler. Wrapping it would change its signature and Express would stop
  // recognising it as an error handler.
  if (handler.length === 4) return handler

  return function wrapped(req, res, next) {
    try {
      const result = (handler as (...a: unknown[]) => unknown)(req, res, next)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        ;(result as Promise<unknown>).catch(next)
      }
      return result
    } catch (err) {
      next(err)
      return undefined
    }
  } as RequestHandler
}

export function createRouter(): IRouter {
  const router = Router()

  for (const method of METHODS) {
    const original = (router as unknown as Record<string, (...a: unknown[]) => unknown>)[
      method
    ].bind(router)

    ;(router as unknown as Record<string, (...a: unknown[]) => unknown>)[method] = (
      ...args: unknown[]
    ) =>
      original(
        ...args.map((arg) =>
          typeof arg === 'function' ? wrapHandler(arg as RequestHandler) : arg,
        ),
      )
  }

  return router
}
