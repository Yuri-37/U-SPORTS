import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

export interface MatchPresenceEntry {
  user_id: string
  full_name: string
  role: string
  online_at: string
}

const DISCONNECT_DEBOUNCE_MS = 40_000

/**
 * Per-match presence — who's currently on this specific scoring page, not the
 * site-wide "who's online anywhere" list (see OnlineOrganizers.tsx, which this
 * generalizes: same Presence API pattern, scoped to a `scoring-presence-${matchId}`
 * channel instead of one global channel, and without `current_page` since
 * everyone here is, by construction, already on this exact page).
 *
 * Also debounces "the current lock holder just dropped out of presence" into
 * `disconnectedHolder`, so a caller can offer another organizer a one-click
 * takeover instead of leaving a live match stuck on someone who's gone.
 */
export function useMatchPresence({
  matchId,
  scopedProfile,
  scoringLockHolderId = null,
  clockLockHolderId = null,
}: {
  matchId: string | undefined
  scopedProfile: Profile | null
  /** When given, also detects (with a debounce) whether a lock holder has
   *  dropped out of presence — see `disconnectedHolder` below. */
  scoringLockHolderId?: string | null
  clockLockHolderId?: string | null
}) {
  const [online, setOnline] = useState<MatchPresenceEntry[]>([])
  const [disconnectedHolder, setDisconnectedHolder] = useState({ scoring: false, clock: false })
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const scoringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (
      !matchId ||
      !scopedProfile ||
      (scopedProfile.role !== 'Organizer' &&
        scopedProfile.role !== 'Coach' &&
        scopedProfile.role !== 'Admin')
    ) {
      setOnline([])
      return
    }

    const channel = supabase.channel(`scoring-presence-${matchId}`, {
      config: { presence: { key: scopedProfile.id } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<MatchPresenceEntry>()
        const all = Object.values(state).flat()
        setOnline(all.filter((s) => s.user_id !== scopedProfile.id))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: scopedProfile.id,
            full_name: scopedProfile.full_name,
            role: scopedProfile.role,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [matchId, scopedProfile])

  // Debounced disconnect detection — independent per lock, so scoring and
  // clock holders are tracked separately (they may not be the same person).
  useEffect(() => {
    const selfId = scopedProfile?.id
    const isPresent = (id: string) => online.some((o) => o.user_id === id)

    const check = (
      holderId: string | null,
      timerRef: { current: ReturnType<typeof setTimeout> | null },
      key: 'scoring' | 'clock',
    ) => {
      const absent = !!holderId && holderId !== selfId && !isPresent(holderId)
      if (absent) {
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => {
            setDisconnectedHolder((prev) => ({ ...prev, [key]: true }))
          }, DISCONNECT_DEBOUNCE_MS)
        }
      } else {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        setDisconnectedHolder((prev) => (prev[key] ? { ...prev, [key]: false } : prev))
      }
    }

    check(scoringLockHolderId, scoringTimerRef, 'scoring')
    check(clockLockHolderId, clockTimerRef, 'clock')
  }, [online, scoringLockHolderId, clockLockHolderId, scopedProfile?.id])

  useEffect(() => {
    return () => {
      if (scoringTimerRef.current) clearTimeout(scoringTimerRef.current)
      if (clockTimerRef.current) clearTimeout(clockTimerRef.current)
    }
  }, [])

  return { online, disconnectedHolder }
}
