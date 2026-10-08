import React from 'react'
import { Medal, Volleyball } from 'lucide-react'
import { cn, getSportLabel } from '../../lib/utils'
import type { Sport } from '../../types'

/**
 * The sport glyphs, as drawn icons rather than emoji.
 *
 * Emoji rendered as whatever colour font the device happened to ship, sat
 * oddly against the monochrome lucide icons used everywhere else, and read as
 * a picture to a screen reader. These inherit `currentColor` and line up with
 * the rest of the icon set (24x24, 2px round strokes), so a sport marker looks
 * like every other icon in the system.
 *
 * lucide has a volleyball but no basketball or table tennis, so those two are
 * drawn here in the same geometry.
 */

type IconProps = { className?: string }

function BasketballIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M4.9 4.9c3.9 3.9 3.9 10.3 0 14.2" />
      <path d="M19.1 4.9c-3.9 3.9-3.9 10.3 0 14.2" />
    </svg>
  )
}

function TableTennisIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* A paddle, not a magnifier: a flat-bottomed blade on a short, thick
          handle (a lens has a long thin one), tilted, with the ball beside it. */}
      {/* Mirrored so the handle runs down-left: a lens's handle runs down-right,
          and at 24px that one direction is what the eye reads first. */}
      <g transform="translate(24 0) scale(-1 1) rotate(-40 10 12)">
        <ellipse cx="10" cy="8.5" rx="7" ry="6" />
        {/* the rubber's edge — what a lens does not have */}
        <path d="M5.2 13.2c1.4.9 2.9 1.3 4.8 1.3s3.4-.4 4.8-1.3" />
        <path d="M8.5 14.6V21a1.5 1.5 0 0 0 3 0v-6.4" />
      </g>
      <circle cx="19.5" cy="18" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function SportIcon({
  sport,
  className = 'w-4 h-4',
}: {
  sport: Sport | string | null | undefined
  className?: string
}) {
  if (sport === 'basketball') return <BasketballIcon className={className} />
  if (sport === 'table-tennis') return <TableTennisIcon className={className} />
  if (sport === 'volleyball') return <Volleyball className={className} aria-hidden />
  // An unknown sport still gets a marker rather than a gap.
  return <Medal className={className} aria-hidden />
}

/** Icon + label on one line — the icon-then-name pairing these replaced. */
export function SportTag({
  sport,
  className,
  iconClassName = 'w-4 h-4 shrink-0',
}: {
  sport: Sport | string | null | undefined
  className?: string
  iconClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 align-middle', className)}>
      <SportIcon sport={sport} className={iconClassName} />
      {getSportLabel(sport as Sport)}
    </span>
  )
}
