import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

function syncPersistedProfileToSession(nextSession: Session | null) {
  const { clearStaleRoleData } = useAuthStore.getState()
  const uid = nextSession?.user?.id
  if (!uid) {
    clearStaleRoleData()
    return
  }
  const { profile } = useAuthStore.getState()
  if (profile?.id !== uid) clearStaleRoleData()
}

export function useAuth() {
  const { session, profile, loading, setSession, setLoading, fetchProfile } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      syncPersistedProfileToSession(data.session)
      setSession(data.session)
      if (data.session?.user) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncPersistedProfileToSession(nextSession)
      setSession(nextSession)
      if (nextSession?.user) {
        fetchProfile(nextSession.user.id)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return { session, profile, loading }
}
