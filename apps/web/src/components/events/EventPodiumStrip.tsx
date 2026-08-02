import React from 'react'
import { Trophy, Medal } from 'lucide-react'
import { Card } from '../ui'
import type { EventPlacement } from '../../lib/eventPlacements'
import { placementRankLabel } from '../../lib/eventPlacements'

type Props = {
  placements: EventPlacement[]
  labelByParticipantId: Record<string, string>
  /** Optional title override */
  title?: string
  className?: string
}

export default function EventPodiumStrip({ placements, labelByParticipantId, title = 'Results', className }: Props) {
  if (placements.length === 0) return null

  const champ = placements.find((p) => p.rank === 1)
  const runner = placements.find((p) => p.rank === 2)

  return (
    <Card className={className ?? ''}>
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {champ ? (
          <div className="flex items-start gap-3 rounded-lg border border-[#FFB800]/25 bg-[#FFB800]/5 px-3 py-2.5">
            <Trophy className="w-5 h-5 text-[#FFB800] shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">{placementRankLabel(1)}</p>
              <p className="font-semibold text-sm truncate">{labelByParticipantId[champ.participantId] ?? '—'}</p>
            </div>
          </div>
        ) : null}
        {runner ? (
          <div className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2.5">
            <Medal className="w-5 h-5 text-[var(--text-secondary)] shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">{placementRankLabel(2)}</p>
              <p className="font-semibold text-sm truncate">{labelByParticipantId[runner.participantId] ?? '—'}</p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
