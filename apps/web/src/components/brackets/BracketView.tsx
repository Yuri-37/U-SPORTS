import React, { useRef } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react'
import { toPng } from 'html-to-image'
import type { Bracket, Match } from '../../types'
import { cn } from '../../lib/utils'

interface Props {
  brackets: Bracket[]
  matches: Match[]
  /** Maps participant_id (team or athlete UUID) → display name */
  participantLabels?: Record<string, string>
  onMatchClick?: (match: Match) => void
  /** Kept for API compatibility; bracket cells use {@link onMatchClick} when provided. */
  readonly?: boolean
}

function slotLabel(
  id: string | null | undefined,
  participantLabels: Record<string, string> | undefined,
  slot: 'a' | 'b',
  isBye: boolean,
): string {
  if (slot === 'b' && isBye) return 'BYE'
  if (!id) return 'TBD'
  const name = participantLabels?.[id]
  if (name) return name
  return id.slice(0, 8) + '…'
}

/** Avoid `null === null`: empty slots must not show as “winner”. */
function isWinnerSlot(
  participantId: string | null | undefined,
  winnerId: string | null | undefined,
): boolean {
  return Boolean(participantId && winnerId && participantId === winnerId)
}

export default function BracketView({ brackets, matches, participantLabels, onMatchClick }: Props) {
  const bracketRef = useRef<HTMLDivElement>(null)

  const visibleBrackets = brackets.filter((b) => b.bracket_type !== 'losers')

  function roundColumnLabel(round: number, maxRound: number, inRound: Bracket[]): string {
    if (round === maxRound) return '🏆 Final'
    const typesInRound = new Set(inRound.map((b) => b.bracket_type))
    if (round === maxRound - 1) {
      return typesInRound.has('crossover_semi') ? 'Crossover semis' : 'Semi-Final'
    }
    if (typesInRound.has('rr_pool_a')) return 'Pool A · Round robin'
    if (typesInRound.has('rr_pool_b')) return 'Pool B · Round robin'
    return `Round ${round}`
  }

  const maxRound =
    visibleBrackets.length === 0 ? 0 : Math.max(...visibleBrackets.map((b) => b.round), 0)
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1)

  const getBracketsForRound = (round: number) =>
    visibleBrackets.filter((b) => b.round === round).sort((a, b) => a.match_order - b.match_order)

  const getMatch = (bracketId: string) => matches.find((m) => m.bracket_id === bracketId)

  const handleExport = async () => {
    if (!bracketRef.current) return
    // Match the canvas to whatever theme is actually active — a hardcoded dark
    // background here would export white-on-white text in light mode.
    const canvasBg =
      getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() ||
      '#111118'
    const dataUrl = await toPng(bracketRef.current, { backgroundColor: canvasBg })
    const link = document.createElement('a')
    link.download = 'bracket.png'
    link.href = dataUrl
    link.click()
  }

  if (visibleBrackets.length === 0) {
    return (
      <div className="text-center text-[var(--text-muted)] py-12">No bracket generated yet</div>
    )
  }

  return (
    <div className="relative">
      <div className="flex gap-2 mb-3 justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export PNG
        </button>
      </div>
      <TransformWrapper initialScale={1} minScale={0.3} maxScale={2} centerOnInit>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <div className="flex gap-2 p-2 bg-[var(--surface-card)] border-b border-[var(--border-subtle)]">
              <button
                onClick={() => zoomIn()}
                className="p-1.5 rounded hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => zoomOut()}
                className="p-1.5 rounded hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => resetTransform()}
                className="p-1.5 rounded hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            <TransformComponent>
              <div ref={bracketRef} className="flex gap-0 p-6 min-w-max">
                {rounds.map((round) => {
                  const roundBrackets = getBracketsForRound(round)
                  return (
                    <div key={round} className="flex flex-col justify-around min-w-[180px]">
                      <div className="text-center text-xs text-[var(--text-muted)] mb-4 font-semibold uppercase tracking-wider px-4">
                        {roundColumnLabel(round, maxRound, roundBrackets)}
                      </div>
                      <div className="flex flex-col justify-around flex-1 gap-4">
                        {roundBrackets.map((bracket) => {
                          const match = getMatch(bracket.id)
                          const isLive = match?.status === 'live'
                          const isDone = match?.status === 'completed' || bracket.is_bye
                          const clickable = Boolean(match && onMatchClick)
                          return (
                            <div key={bracket.id} className="relative">
                              <div
                                role={clickable ? 'button' : undefined}
                                tabIndex={clickable ? 0 : undefined}
                                className={cn(
                                  'border rounded-xl overflow-hidden transition-all text-left',
                                  isLive
                                    ? 'border-[#FF3355] shadow-[0_0_12px_rgba(255,51,85,0.3)]'
                                    : 'border-[var(--border-subtle)]',
                                  isDone ? 'opacity-80' : '',
                                  clickable
                                    ? 'cursor-pointer hover:border-[#0066FF]/50 hover:shadow-[0_0_8px_rgba(0,102,255,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]'
                                    : '',
                                )}
                                style={{ width: 160 }}
                                onClick={() => clickable && match && onMatchClick?.(match)}
                                onKeyDown={(e) => {
                                  if (!clickable || !match) return
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onMatchClick?.(match)
                                  }
                                }}
                              >
                                {isLive && (
                                  <div className="bg-[#FF3355] text-white text-[9px] font-bold text-center py-0.5 tracking-widest">
                                    ● LIVE
                                  </div>
                                )}
                                {/* Participant A */}
                                <div
                                  className={cn(
                                    'flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]',
                                    // Exactly one background class — stacking a tint on top of
                                    // bg-surface-card left the winner row's color decided by
                                    // stylesheet order rather than theme.
                                    isWinnerSlot(bracket.participant_a_id, bracket.winner_id)
                                      ? 'bg-[var(--success)]/15'
                                      : 'bg-[var(--surface-card)]',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'text-xs truncate flex-1 text-[var(--text-primary)]',
                                      isWinnerSlot(bracket.participant_a_id, bracket.winner_id)
                                        ? 'font-bold'
                                        : 'font-medium',
                                    )}
                                    title={bracket.participant_a_id ?? undefined}
                                  >
                                    {slotLabel(
                                      bracket.participant_a_id,
                                      participantLabels,
                                      'a',
                                      bracket.is_bye,
                                    )}
                                  </span>
                                  {isWinnerSlot(bracket.participant_a_id, bracket.winner_id) && (
                                    <span className="text-[var(--success)] text-xs ml-1">✓</span>
                                  )}
                                </div>
                                {/* Participant B */}
                                <div
                                  className={cn(
                                    'flex items-center justify-between px-3 py-2',
                                    isWinnerSlot(bracket.participant_b_id, bracket.winner_id)
                                      ? 'bg-[var(--success)]/15'
                                      : 'bg-[var(--surface-card)]',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'text-xs truncate flex-1 text-[var(--text-primary)]',
                                      isWinnerSlot(bracket.participant_b_id, bracket.winner_id)
                                        ? 'font-bold'
                                        : 'font-medium',
                                    )}
                                    title={bracket.participant_b_id ?? undefined}
                                  >
                                    {slotLabel(
                                      bracket.participant_b_id,
                                      participantLabels,
                                      'b',
                                      bracket.is_bye,
                                    )}
                                  </span>
                                  {isWinnerSlot(bracket.participant_b_id, bracket.winner_id) && (
                                    <span className="text-[var(--success)] text-xs ml-1">✓</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </TransformComponent>
          </div>
        )}
      </TransformWrapper>
    </div>
  )
}
