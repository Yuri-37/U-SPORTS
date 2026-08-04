import React, { useState } from 'react'
import { Lock, Timer } from 'lucide-react'
import { getInitials, cn } from '../../lib/utils'
import type { MatchPresenceEntry } from '../../hooks/useMatchPresence'

interface Props {
  online: MatchPresenceEntry[]
  scoringLockHolderId: string | null
  clockLockHolderId: string | null
}

/** Who else is currently on this match's scoring page — same avatar styling as
 *  OnlineOrganizers.tsx (site-wide), but scoped to this match, and with small
 *  corner badges marking the scoring-lock and clock-lock holders. `online`
 *  comes from a single useMatchPresence() call in the parent (Scoring.tsx) so
 *  this and MatchActivityFeed share one presence channel instead of each
 *  opening their own. */
export default function MatchPresenceAvatars({ online, scoringLockHolderId, clockLockHolderId }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (online.length === 0) return null

  const visibleOnline = online.slice(0, 4)
  const overflow = online.length - 4

  return (
    <div className="relative flex items-center gap-1">
      {visibleOnline.map((user) => {
        const holdsScoring = user.user_id === scoringLockHolderId
        const holdsClock = user.user_id === clockLockHolderId
        return (
          <div key={user.user_id} className="relative group">
            <div className="w-7 h-7 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--school-secondary)] border-2 border-[var(--surface-card)] cursor-default">
              {getInitials(user.full_name)}
            </div>
            {holdsScoring && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#0066FF] border border-[var(--surface-card)] flex items-center justify-center">
                <Lock className="w-2 h-2 text-white" />
              </div>
            )}
            {holdsClock && (
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--warning)] border border-[var(--surface-card)] flex items-center justify-center">
                <Timer className="w-2 h-2 text-white" />
              </div>
            )}
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
              <p className="font-semibold text-[var(--text-primary)]">{user.full_name}</p>
              <p className="text-[var(--text-muted)] capitalize">{user.role.replace('_', ' ')}</p>
              {holdsScoring && <p className="text-[#0066FF]">Scoring</p>}
              {holdsClock && <p className="text-[var(--warning)]">Clock</p>}
            </div>
          </div>
        )
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'w-7 h-7 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]',
          )}
        >
          +{overflow}
        </button>
      )}
      {expanded && overflow > 0 && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg p-2 shadow-xl z-50">
          {online.slice(4).map((user) => (
            <div key={user.user_id} className="flex items-center gap-2 py-1 text-xs">
              <div className="w-5 h-5 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-[9px] font-bold text-[var(--school-secondary)] shrink-0">
                {getInitials(user.full_name)}
              </div>
              <span className="text-[var(--text-primary)] truncate">{user.full_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
