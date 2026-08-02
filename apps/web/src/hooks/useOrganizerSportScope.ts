import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Sport } from '../types'

const FALLBACK: Sport[] = ['basketball', 'volleyball', 'table-tennis']

export async function fetchActiveSportsFromConfig(): Promise<Sport[]> {
  const { data, error } = await supabase.from('sports_config').select('slug').eq('is_active', true)
  if (error || !data?.length) return [...FALLBACK]
  const slugs = data.map((r) => r.slug as Sport).filter((s): s is Sport => {
    return s === 'basketball' || s === 'volleyball' || s === 'table-tennis'
  })
  return slugs.length > 0 ? slugs : [...FALLBACK]
}

function coversAllActive(assigned: string[], active: Sport[]): boolean {
  if (active.length === 0) return false
  const set = new Set(assigned)
  return active.every((s) => set.has(s))
}

export function useOrganizerSportScope() {
  const { profile, organizer } = useAuthStore()
  const [activeSports, setActiveSports] = useState<Sport[]>(() => [...FALLBACK])

  useEffect(() => {
    let cancelled = false
    void fetchActiveSportsFromConfig().then((s) => {
      if (!cancelled && s.length > 0) setActiveSports(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const isSuperAdmin = profile?.role === 'Admin'
  const assignedSports = (organizer?.assigned_sports ?? []) as string[]

  const hasFullSportAccess = useMemo(() => {
    if (isSuperAdmin) return true
    return coversAllActive(assignedSports, activeSports)
  }, [isSuperAdmin, assignedSports, activeSports])

  const canConfigureSport = useMemo(() => {
    return (sport: string): boolean => {
      if (isSuperAdmin) return true
      if (coversAllActive(assignedSports, activeSports)) return true
      return assignedSports.includes(sport)
    }
  }, [isSuperAdmin, assignedSports, activeSports])

  const sportOptionsForForms = useMemo(() => {
    const base: { value: Sport; label: string }[] = [
      { value: 'basketball', label: '🏀 Basketball' },
      { value: 'volleyball', label: '🏐 Volleyball' },
      { value: 'table-tennis', label: '🏓 Table Tennis' },
    ]
    const activeSet = new Set(activeSports)
    const inInstitution = base.filter((o) => activeSet.has(o.value))
    if (isSuperAdmin || coversAllActive(assignedSports, activeSports)) {
      return inInstitution
    }
    return inInstitution.filter((o) => assignedSports.includes(o.value))
  }, [isSuperAdmin, assignedSports, activeSports])

  return {
    activeSports,
    assignedSports,
    hasFullSportAccess,
    canConfigureSport,
    sportOptionsForForms,
  }
}
