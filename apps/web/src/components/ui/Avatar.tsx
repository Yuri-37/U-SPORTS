import React from 'react'
import { getInitials } from '../../lib/utils'
import { cn } from '../../lib/utils'

/**
 * A person's photo, or their initials on the school's colours when they have none.
 * One component for every list and profile that shows an athlete, so a photo
 * someone uploads appears everywhere at once.
 */
export default function Avatar({
  src,
  name,
  size = 28,
  className,
}: {
  src?: string | null
  name: string
  size?: number
  className?: string
}) {
  const box = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        style={box}
        className={cn('shrink-0 rounded-full object-cover bg-[var(--surface-elevated)]', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={box}
      className={cn(
        'shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--school-primary)] font-bold text-[var(--school-secondary)]',
        className,
      )}
    >
      {getInitials(name)}
    </span>
  )
}
