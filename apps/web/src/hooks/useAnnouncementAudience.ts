import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Announcement } from '../types'

/**
 * Decides whether the person looking at a banner is in its audience.
 *
 * "Audience" used to decide only who was sent the inbox notification, so a
 * banner written for one team was readable by every athlete on every team (and
 * by guests, if it was also marked public). This is the matching rule for what
 * is DISPLAYED:
 *  - an announcement for everyone is shown to everyone it is public for;
 *  - one aimed at a sport, event or team is shown only to athletes in it, and
 *    to staff (who manage them) -- never to a guest.
 *
 * `publicOnly` is the guest hub, which has no signed-in person to match.
 */
export function useAnnouncementAudience(publicOnly: boolean) {
  const { profile, athlete } = useAuthStore()
  const isStaff =
    !publicOnly &&
    (profile?.role === 'Admin' || profile?.role === 'Organizer' || profile?.role === 'Coach')
  const athleteId = !publicOnly && !isStaff ? athlete?.id : undefined
  const athleteSport = athlete?.sport

  // Teams and events this athlete is part of. null = not looked up yet, in which
  // case targeted banners stay hidden rather than flashing to the wrong person.
  const [membership, setMembership] = useState<{ teamIds: string[]; eventIds: string[] } | null>(
    null,
  )

  useEffect(() => {
    if (!athleteId) {
      setMembership({ teamIds: [], eventIds: [] })
      return
    }
    let cancelled = false
    void (async () => {
      const { data: tm } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('athlete_id', athleteId)
      const teamIds = [...new Set((tm ?? []).map((r) => r.team_id as string).filter(Boolean))]
      // A participant is either a team or (for solo entries) the athlete.
      const { data: ep } = await supabase
        .from('event_participants')
        .select('event_id')
        .in('participant_id', [athleteId, ...teamIds])
      const eventIds = [...new Set((ep ?? []).map((r) => r.event_id as string).filter(Boolean))]
      if (!cancelled) setMembership({ teamIds, eventIds })
    })()
    return () => {
      cancelled = true
    }
  }, [athleteId])

  return useCallback(
    (a: Pick<Announcement, 'audience_type' | 'audience_id' | 'audience_sport'>): boolean => {
      if (!a.audience_type || a.audience_type === 'all') return true
      if (publicOnly) return false
      if (isStaff) return true
      if (!athleteId || !membership) return false
      if (a.audience_type === 'sport') return !!athleteSport && a.audience_sport === athleteSport
      if (a.audience_type === 'team') return !!a.audience_id && membership.teamIds.includes(a.audience_id)
      if (a.audience_type === 'event') return !!a.audience_id && membership.eventIds.includes(a.audience_id)
      return false
    },
    [publicOnly, isStaff, athleteId, athleteSport, membership],
  )
}
