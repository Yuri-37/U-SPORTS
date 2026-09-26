import React from 'react'
import { Button } from '../ui'

/*
  Section building blocks shared by the public pages (hub, app details).
  Extracted from pages/guest/Hub.tsx so both pages speak the same visual
  language instead of each growing its own copy.
*/

/** Small monospace kicker that opens a section. */
export function SectionLabel({
  children,
  dot = 'brand',
}: {
  children: React.ReactNode
  dot?: 'brand' | 'danger'
}) {
  return (
    <span className="inline-flex items-center gap-3 rounded-full border border-[var(--school-primary)]/25 bg-[var(--school-primary)]/5 px-4 py-1.5">
      <span
        className={`h-2 w-2 rounded-full ${
          dot === 'danger' ? 'bg-[var(--danger)] animate-pulse-dot' : 'bg-[var(--school-primary)]'
        }`}
      />
      <span className="label-mono text-[var(--brand-ink)]">
        {children}
      </span>
    </span>
  )
}

/** Section opener: kicker, display heading, optional blurb and inline actions. */
export function SectionHeading({
  label,
  title,
  subtitle,
  dot,
  action,
  secondaryAction,
  align = 'left',
}: {
  label: string
  title: string
  subtitle?: string
  dot?: 'brand' | 'danger'
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  /** 'center' stacks everything on the page's axis (no side actions). */
  align?: 'left' | 'center'
}) {
  if (align === 'center') {
    return (
      <div className="mb-12 flex flex-col items-center text-center">
        <SectionLabel dot={dot}>{label}</SectionLabel>
        <h2 className="font-display text-3xl lg:text-[2.6rem] leading-[1.15] mt-4">{title}</h2>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-[var(--text-secondary)] leading-relaxed">{subtitle}</p>
        )}
      </div>
    )
  }
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <SectionLabel dot={dot}>{label}</SectionLabel>
        <h2 className="font-display text-3xl lg:text-[2.6rem] leading-[1.15] mt-4">{title}</h2>
        {subtitle && (
          <p className="mt-3 text-[var(--text-secondary)] leading-relaxed">{subtitle}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-1 flex-wrap">
          {action && (
            <Button size="sm" variant="ghost" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** One figure in the inverted stats band. */
export function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 text-center">
      <p className="font-display text-4xl lg:text-5xl text-white">{value.toLocaleString()}</p>
      <p className="label-mono mt-3 text-white/70">{label}</p>
    </div>
  )
}

/** Compact figure + label pair used inside the sport tiles. */
export function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl leading-none text-[var(--text-primary)]">{value}</p>
      <p className="label-mono mt-1.5 text-[var(--text-muted)]">{label}</p>
    </div>
  )
}
