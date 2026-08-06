import React from 'react'
import { Trophy, Medal, ChevronRight } from 'lucide-react'
import { Card } from '../ui'
import type { EventPlacement } from '../../lib/eventPlacements'
import { placementRankLabel } from '../../lib/eventPlacements'

type Props = {
  placements: EventPlacement[]
  labelByParticipantId: Record<string, string>
  /** team vs athlete — decides whether a row links to /guest/teams/:id or
   * /guest/athletes/:id. Unknown ids (lookup still in flight, or a
   * participant that resolved to neither table) render unclickable. */
  typeByParticipantId?: Record<string, 'team' | 'athlete'>
  onSelect?: (participantId: string, type: 'team' | 'athlete') => void
  /** Optional title override */
  title?: string
  className?: string
}

export default function EventPodiumStrip({
  placements,
  labelByParticipantId,
  typeByParticipantId = {},
  onSelect,
  title = 'Results',
  className,
}: Props) {
  if (placements.length === 0) return null

  const champ = placements.find((p) => p.rank === 1)
  const runner = placements.find((p) => p.rank === 2)
  const rest = placements.filter((p) => p.rank > 2)

  const clickable = (participantId: string) => {
    const type = typeByParticipantId[participantId]
    return Boolean(onSelect && type)
  }
  const handleClick = (participantId: string) => {
    const type = typeByParticipantId[participantId]
    if (onSelect && type) onSelect(participantId, type)
  }

  return (
    <Card className={className ?? ''}>
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {champ ? (
          <button
            type="button"
            disabled={!clickable(champ.participantId)}
            onClick={() => handleClick(champ.participantId)}
            className={`flex items-start gap-3 rounded-lg border border-[#FFB800]/25 bg-[#FFB800]/5 px-3 py-2.5 text-left ${clickable(champ.participantId) ? 'cursor-pointer hover:border-[#FFB800]/50 transition-colors' : 'cursor-default'}`}
          >
            <Trophy className="w-5 h-5 text-[#FFB800] shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">{placementRankLabel(1)}</p>
              <p className="font-semibold text-sm truncate">
                {labelByParticipantId[champ.participantId] ?? '—'}
              </p>
            </div>
          </button>
        ) : null}
        {runner ? (
          <button
            type="button"
            disabled={!clickable(runner.participantId)}
            onClick={() => handleClick(runner.participantId)}
            className={`flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2.5 text-left ${clickable(runner.participantId) ? 'cursor-pointer hover:border-[var(--accent-default)]/35 transition-colors' : 'cursor-default'}`}
          >
            <Medal className="w-5 h-5 text-[var(--text-secondary)] shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">{placementRankLabel(2)}</p>
              <p className="font-semibold text-sm truncate">
                {labelByParticipantId[runner.participantId] ?? '—'}
              </p>
            </div>
          </button>
        ) : null}
      </div>

      {rest.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-1">
          {rest.map((p) => (
            <button
              key={p.participantId}
              type="button"
              disabled={!clickable(p.participantId)}
              onClick={() => handleClick(p.participantId)}
              className={`w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left ${clickable(p.participantId) ? 'cursor-pointer hover:bg-[var(--surface-elevated)] transition-colors' : 'cursor-default'}`}
            >
              <span className="w-7 shrink-0 text-xs font-semibold text-[var(--text-muted)] tabular-nums">
                {placementRankLabel(p.rank)}
              </span>
              <span className="min-w-0 flex-1 text-sm truncate">
                {labelByParticipantId[p.participantId] ?? '—'}
              </span>
              {clickable(p.participantId) ? (
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
