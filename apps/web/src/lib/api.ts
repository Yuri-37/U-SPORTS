import axios from 'axios'
import { supabase } from './supabase'
import { describeApiError } from './apiError'
import { toast } from '../stores/toastStore'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Opt a write out of the automatic failure toast (the caller shows its own). */
    silentError?: boolean
  }
}

const WRITE_METHODS = new Set(['post', 'patch', 'put', 'delete'])
/**
 * Background or self-reporting writes that must not pop a toast: live scoring
 * (the scoreboard reports its own conflicts and lock hand-overs), read/clear
 * housekeeping, tour bookkeeping, and the privacy gate (has its own screen).
 */
const QUIET_PATHS = [
  '/scoring/',
  '/notifications',
  '/profile/tour-completion',
  '/auth/accept-privacy-notice',
]

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Every save/update/delete that fails says so, in one consistent place --
    // individual screens used to show it inline, or not at all.
    const cfg = error.config as
      | { method?: string; url?: string; silentError?: boolean }
      | undefined
    const status = error.response?.status
    if (
      cfg &&
      !cfg.silentError &&
      status !== 401 &&
      !axios.isCancel(error) &&
      WRITE_METHODS.has((cfg.method ?? '').toLowerCase()) &&
      !QUIET_PATHS.some((p) => (cfg.url ?? '').includes(p))
    ) {
      toast.error(describeApiError(error, 'That did not save'))
    }
    if (error.response?.status === 401) {
      const raw = error.response?.data?.error
      const msg = typeof raw === 'string' ? raw : ''
      const deactivated = msg.toLowerCase().includes('deactivated')
      void supabase.auth.signOut().then(() => {
        // "Account deactivated" is only ever an Organizer/Coach state (see
        // apps/server/src/middleware/auth.ts) — both sign in through the Staff
        // Portal, so that's always the right destination for it, regardless
        // of whether the request came from a /super-admin or /organizer page.
        const isStaffArea =
          typeof window !== 'undefined' &&
          (window.location.pathname.startsWith('/super-admin') ||
            window.location.pathname.startsWith('/organizer'))
        let dest = isStaffArea ? '/super-admin/login' : '/auth/login'
        if (deactivated) dest += '?reason=deactivated'
        window.location.href = dest
      })
    }
    return Promise.reject(error)
  },
)

export default api
