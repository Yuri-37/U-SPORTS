import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile, Athlete, Organizer } from '../types'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  athlete: Athlete | null
  organizer: Organizer | null
  loading: boolean
  /** Clears persisted profile rows when session user changes or signs out */
  clearStaleRoleData: () => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setAthlete: (athlete: Athlete | null) => void
  setOrganizer: (organizer: Organizer | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
  fetchProfile: (userId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      user: null,
      profile: null,
      athlete: null,
      organizer: null,
      loading: true,

      setSession: (session) => set({ session, user: session?.user ?? null }),
      setProfile: (profile) => set({ profile }),
      setAthlete: (athlete) => set({ athlete }),
      setOrganizer: (organizer) => set({ organizer }),
      setLoading: (loading) => set({ loading }),

      clearStaleRoleData: () => set({ profile: null, athlete: null, organizer: null }),

      fetchProfile: async (userId: string) => {
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle()

          if (!profileRow) return

          // Post-037: profiles.role is one of Admin/Organizer/Coach or null.
          const dbRole = (profileRow.role ?? null) as 'Admin' | 'Organizer' | 'Coach' | null

          // Organizers and Coaches both have an organizers row (sport scope, active flag).
          let organizer: Organizer | null = null
          if (dbRole === 'Organizer' || dbRole === 'Coach') {
            const { data } = await supabase
              .from('organizers')
              .select('*')
              .eq('profile_id', userId)
              .maybeSingle()
            organizer = data ?? null
          }

          // Athlete identity is the presence of an athletes row (DB role is null for them).
          let athlete: Athlete | null = null
          if (!dbRole) {
            const { data } = await supabase
              .from('athletes')
              .select('*')
              .eq('profile_id', userId)
              .maybeSingle()
            athlete = data ?? null
          }

          const effectiveRole: Profile['role'] =
            dbRole === 'Admin'
              ? 'Admin'
              : dbRole === 'Organizer'
                ? 'Organizer'
                : dbRole === 'Coach'
                  ? 'Coach'
                  : athlete
                    ? 'Athlete'
                    : 'Guest'

          set({ profile: { ...profileRow, role: effectiveRole }, athlete, organizer })
        } catch (err) {
          console.error('Failed to fetch profile:', err)
        }
      },

      signOut: async () => {
        await supabase.auth.signOut()
        set({ session: null, user: null, profile: null, athlete: null, organizer: null })
      },
    }),
    {
      name: 'u-sports-auth',
      partialize: (state) => ({
        profile: state.profile,
        athlete: state.athlete,
        organizer: state.organizer,
      }),
    },
  ),
)
