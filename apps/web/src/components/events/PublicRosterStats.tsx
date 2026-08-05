import React from 'react'
import { Card } from '../ui'
import { STAT_KEYS } from '../../lib/matchStatKeys'

interface PlayerStat {
  athlete_id: string
  athlete?: { id: string; profile?: { full_name: string } | null } | null
  team_id?: string | null
  team_name?: string | null
  participant_side?: 'a' | 'b' | null
  stats: Record<string, number>
}

type Props = {
  sport: string
  playerStats: PlayerStat[]
  nameA: string
  nameB: string
  /** Individual stats only ever populate once a match is completed — see the
   * server's `/scoring/:matchId/roster` route, which zeroes `stats` itself
   * for anything not completed. This just decides whether to render the
   * stat columns at all, roster-only otherwise. */
  showStats: boolean
}

function playerName(p: PlayerStat) {
  return p.athlete?.profile?.full_name ?? `Athlete ${p.athlete_id.slice(0, 6)}`
}

/** Read-only — no inputs, no edit state. See MatchReview.tsx for the organizer editable version this mirrors visually. */
export default function PublicRosterStats({ sport, playerStats, nameA, nameB, showStats }: Props) {
  if (playerStats.length === 0) return null

  if (!showStats) {
    const sideA = playerStats.filter((p) => p.participant_side === 'a')
    const sideB = playerStats.filter((p) => p.participant_side === 'b')
    return (
      <Card>
        <h3 className="font-semibold mb-3 text-sm">Roster</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 truncate">
              {nameA}
            </p>
            <ul className="space-y-1">
              {sideA.map((p) => (
                <li key={p.athlete_id} className="text-[var(--text-secondary)]">
                  {playerName(p)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 truncate">
              {nameB}
            </p>
            <ul className="space-y-1">
              {sideB.map((p) => (
                <li key={p.athlete_id} className="text-[var(--text-secondary)]">
                  {playerName(p)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    )
  }

  const statDefs = STAT_KEYS[sport] ?? STAT_KEYS.basketball

  return (
    <Card>
      <h3 className="font-semibold mb-3 text-sm">Player Stats</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border-subtle)]">
              <th className="text-left py-2 pr-3 w-36 min-w-36 max-w-36 shrink-0 sticky left-0 z-[2] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                Team
              </th>
              <th className="text-left py-2 pr-3 min-w-[8rem] sticky left-36 z-[2] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                Player
              </th>
              {statDefs.map((s) => (
                <th key={s.key} className="text-center py-2 px-2 min-w-[3.5rem]">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {playerStats.map((ps) => {
              const teamLabel =
                ps.team_name?.trim() ??
                (ps.participant_side === 'a' ? nameA : ps.participant_side === 'b' ? nameB : 'Team')
              return (
                <tr key={ps.athlete_id} className="border-t border-[var(--border-subtle)]">
                  <td className="py-2 pr-3 w-36 min-w-36 max-w-36 shrink-0 align-top text-[var(--text-secondary)] sticky left-0 z-[1] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                    <span className="line-clamp-2 break-words text-xs sm:text-sm" title={teamLabel}>
                      {teamLabel}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-medium min-w-[8rem] sticky left-36 z-[1] bg-[var(--surface-card)] shadow-[1px_0_0_var(--border-subtle)]">
                    {playerName(ps)}
                  </td>
                  {statDefs.map((s) => (
                    <td key={s.key} className="py-2 px-2 text-center tabular-nums">
                      {ps.stats?.[s.key] ?? 0}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
