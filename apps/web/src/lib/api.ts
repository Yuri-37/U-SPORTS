import axios from 'axios'
import { supabase } from './supabase'

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
