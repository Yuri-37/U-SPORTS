import { Minus, Plus } from 'lucide-react'

/**
 * Small −/+ number input. Shared by the Create Season modal and the guided
 * tour's placeholder-generator step so the two stay visually identical.
 * Deliberately not a free-text field: every use so far is a small bounded
 * count where typing is slower than tapping.
 */
export function Stepper({
  label,
  value,
  onChange,
  max,
  min = 0,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  max: number
  min?: number
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={`Increase ${label}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default Stepper
