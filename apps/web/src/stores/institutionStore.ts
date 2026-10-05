import { create } from 'zustand'
import type { Institution, SportConfig } from '../types'
import { supabase } from '../lib/supabase'
import { applyTheme } from '../lib/utils'
import { resolveInstitutionLogoUrl } from '../lib/institutionLogoUrl'

interface InstitutionState {
  institution: Institution | null
  sports: SportConfig[]
  loading: boolean
  /** `silent` refreshes in the background without flipping `loading` (no spinner flash). */
  fetchInstitution: (opts?: { silent?: boolean }) => Promise<void>
  setInstitution: (institution: Institution) => void
}

let lastFetchedAt = 0
/** How stale the school profile may get before a returning tab re-reads it. */
const REFRESH_AFTER_MS = 5 * 60 * 1000

export const useInstitutionStore = create<InstitutionState>()((set) => ({
  institution: null,
  sports: [],
  loading: true,

  fetchInstitution: async (opts) => {
    if (!opts?.silent) set({ loading: true })
    lastFetchedAt = Date.now()
    try {
      const { data: institution, error: instError } = await supabase
        .from('institution')
        .select('*')
        .maybeSingle()

      if (instError) {
        console.error('Failed to fetch institution:', instError.message)
        set({ institution: null, sports: [] })
        return
      }

      const { data: sports, error: sportsError } = await supabase
        .from('sports_config')
        .select('*')
        .eq('is_active', true)
        .order('display_name')

      if (sportsError) {
        console.error('Failed to fetch sports_config:', sportsError.message)
      }

      if (institution) {
        applyTheme(institution.primary_color, institution.secondary_color)
      }
      const inst = institution
        ? {
            ...institution,
            logo_url: resolveInstitutionLogoUrl(institution.logo_url) ?? institution.logo_url,
          }
        : null
      set({
        institution: inst,
        sports: sportsError ? [] : (sports ?? []),
      })
    } catch (err) {
      console.error('Failed to fetch institution:', err)
      set({ institution: null, sports: [] })
    } finally {
      set({ loading: false })
    }
  },

  setInstitution: (institution) => {
    applyTheme(institution.primary_color, institution.secondary_color)
    set({
      institution: {
        ...institution,
        logo_url: resolveInstitutionLogoUrl(institution.logo_url) ?? institution.logo_url,
      },
    })
  },
}))

// A tab left open for a while keeps the colors/logo it loaded with. When the
// person comes back to it, re-read the school profile (at most every few
// minutes) so a theme change made by the Super Admin shows up without a manual
// reload.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const { institution, fetchInstitution } = useInstitutionStore.getState()
    if (!institution) return
    if (Date.now() - lastFetchedAt < REFRESH_AFTER_MS) return
    void fetchInstitution({ silent: true })
  })
}
