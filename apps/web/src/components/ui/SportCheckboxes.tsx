import { cn, getSportLabel } from '../../lib/utils'
import type { Sport } from '../../types'

/** Sport checkboxes with a "Select all" toggle — the professor's diagram drew
 *  this explicitly next to the per-season sport list. Shared by the Create
 *  Season modal and the guided tour's placeholder-generator step so both
 *  render the exact same widget instead of drifting apart. */
export function SportCheckboxes({
  options,
  selected,
  onChange,
  dataTour,
  readOnly = false,
}: {
  options: Sport[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Only the Create-season call site sets this — shared with Edit, so a
   *  bare `data-tour` here would match twice in the DOM. */
  dataTour?: string
  /** The tour's top-up step: sports are fixed by the season already picked,
   *  not user-selectable here — render checked+disabled, no "Select all". */
  readOnly?: boolean
}) {
  const allSelected = options.length > 0 && options.every((s) => selected.includes(s))
  return (
    <div data-tour={dataTour}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-[var(--text-secondary)]">Sports</label>
        {!readOnly && (
          <button
            type="button"
            className="text-xs text-[#0066FF] hover:underline"
            onClick={() => onChange(allSelected ? [] : options)}
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((s) => (
          <label
            key={s}
            className={cn(
              'flex items-center gap-2 text-sm rounded-lg border border-[var(--border-subtle)] px-3 py-2',
              readOnly ? 'cursor-default opacity-70' : 'cursor-pointer',
            )}
          >
            <input
              type="checkbox"
              className="size-4 rounded border-[var(--border-subtle)] accent-[#0066FF]"
              checked={selected.includes(s)}
              disabled={readOnly}
              onChange={() =>
                onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s])
              }
            />
            {getSportLabel(s)}
          </label>
        ))}
      </div>
    </div>
  )
}

export default SportCheckboxes
