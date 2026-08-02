import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getInitials, cn } from '../../lib/utils'
import { useNavigate } from 'react-router'
import { sessionScopedProfile } from '../../lib/sessionProfile'

interface PresenceState {
  user_id: string
  full_name: string
  role: string
  current_page: string
  online_at: string
}

export default function OnlineOrganizers() {
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const [online, setOnline] = useState<PresenceState[]>([])
  const [expanded, setExpanded] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const navigate = useNavigate()
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isIdle, setIsIdle] = useState(false)

  useEffect(() => {
    if (
      !scopedProfile ||
      (scopedProfile.role !== 'Organizer' &&
        scopedProfile.role !== 'Coach' &&
        scopedProfile.role !== 'Admin')
    )
      return

    const channel = supabase.channel('organizer-presence', {
      config: { presence: { key: scopedProfile.id } },
    })

    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>()
        const all = Object.values(state).flat()
        setOnline(all.filter((s) => s.user_id !== scopedProfile.id))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: scopedProfile.id,
            full_name: scopedProfile.full_name,
            role: scopedProfile.role,
            current_page: window.location.pathname,
            online_at: new Date().toISOString(),
          })
        }
      })

    const resetIdle = () => {
      setIsIdle(false)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setIsIdle(true), 5 * 60 * 1000)
    }
    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('keydown', resetIdle)
    resetIdle()

    return () => {
      channel.unsubscribe()
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [scopedProfile])

  if (online.length === 0) return null

  const visibleOnline = online.slice(0, 4)
  const overflow = online.length - 4

  return (
    <div className="relative flex items-center gap-1">
      {visibleOnline.map((user) => (
        <div key={user.user_id} className="relative group">
          <div className="w-7 h-7 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--school-secondary)] border-2 border-[var(--surface-card)] cursor-default">
            {getInitials(user.full_name)}
          </div>
          <div
            className={cn(
              'absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-[var(--surface-card)]',
              isIdle ? 'bg-amber-400' : 'bg-[var(--success)]'
            )}
          />
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
            <p className="font-semibold text-[var(--text-primary)]">{user.full_name}</p>
            <p className="text-[var(--text-muted)] capitalize">{user.role.replace('_', ' ')}</p>
            <p className="text-[var(--text-muted)] truncate">{user.current_page}</p>
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-7 h-7 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          +{overflow}
        </button>
      )}
    </div>
  )
}
