import { create } from 'zustand'
import type { Institution, SportConfig } from '../types'
import { supabase } from '../lib/supabase'
import { applyTheme } from '../lib/utils'
import { resolveInstitutionLogoUrl } from '../lib/institutionLogoUrl'

interface InstitutionState {
  institution: Institution | null
  sports: SportConfig[]
  loading: boolean
  fetchInstitution: () => Promise<void>
  setInstitution: (institution: Institution) => void
}

export const useInstitutionStore = create<InstitutionState>()((set) => ({
  institution: null,
  sports: [],
  loading: true,

  fetchInstitution: async () => {
    set({ loading: true })
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
        sports: sportsError ? [] : sports ?? [],
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
