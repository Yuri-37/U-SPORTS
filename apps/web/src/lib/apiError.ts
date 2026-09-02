/**
 * Turns an axios failure into something a user can act on.
 *
 * The important case is the one that used to fall through to a bare "Could
 * not create X": when the request times out or never reaches the server there
 * IS no `response.data.error` to read, so every such failure rendered as a
 * generic message that looked like a validation error. The API is hosted on a
 * free tier that cold-starts in 30-50s after idling, which is exactly long
 * enough to trip the client timeout -- so "the server is waking up, retry" is
 * a real and common answer, and worth saying out loud.
 */
export function describeApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as {
      code?: string
      message?: string
      response?: { status?: number; data?: { error?: string } }
    }

    // The server answered and told us why -- always prefer that.
    const serverMessage = e.response?.data?.error
    if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage

    if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message ?? '')) {
      return 'The server took too long to respond — it may be waking up after being idle. Wait a few seconds and try again.'
    }

    if (/Network Error|ECONNREFUSED|Failed to fetch/i.test(e.message ?? '')) {
      return 'Cannot reach the server. Check your connection and try again.'
    }

    // Answered, but with no usable body (a proxy 502/504 page, say).
    const status = e.response?.status
    if (status) return `${fallback} (server responded HTTP ${status}). Please try again.`
  }
  return fallback
}
