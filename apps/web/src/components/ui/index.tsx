import React from 'react'
import { cn } from '../../lib/utils'
import { Loader2, X } from 'lucide-react'

export { default as PasswordStrengthMeter } from './PasswordStrengthMeter'

// ─── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  icon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  // `active:scale-[0.98]` gives every button the same tactile press.
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold rounded-[10px] transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none'
  const variants = {
    // The primary action carries the school's own color, not the electric-blue
    // accent it used to hardcode -- the accent is a supporting highlight
    // (hovers, badges, links), never the thing a brand is recognised by.
    primary:
      'bg-[var(--school-primary)] text-white shadow-[var(--shadow-primary-btn)] hover:brightness-110',
    // White, outlined and slightly raised -- the everyday secondary action.
    secondary:
      'bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-[var(--shadow-raised)]',
    danger:
      'bg-[#FF3355] hover:bg-[#CC2244] text-white shadow-[0_6px_14px_-4px_rgba(255,51,85,0.45)]',
    // Bare icon + text, for toolbar actions that shouldn't compete with the page.
    ghost:
      'bg-transparent hover:bg-[var(--shell-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    outline:
      'bg-transparent border border-[var(--school-primary)]/35 hover:border-[var(--school-primary)] text-[var(--text-primary)]',
    success:
      'bg-[var(--success)] hover:opacity-90 text-white shadow-[0_6px_14px_-4px_rgba(5,150,105,0.4)]',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
    xl: 'px-6 py-3 text-lg',
  }
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode
  className?: string
  elevated?: boolean
  onClick?: () => void
  /**
   * Opt a non-clickable card into the hover lift — for a card that is itself a
   * link target or a feature tile. Clickable cards (`onClick`) get it already.
   */
  interactive?: boolean
  /** Rarely needed — e.g. `data-tour` anchors for the guided tour system. */
  [dataAttr: `data-${string}`]: string | undefined
}

export function Card({
  children,
  className,
  elevated,
  onClick,
  interactive,
  ...rest
}: CardProps) {
  // Anything you can act on lifts on hover; a static panel in a dense
  // dashboard stays put, so a mouse crossing a stat grid doesn't ripple.
  const lifts = Boolean(onClick) || interactive
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-subtle)] p-4 shadow-[var(--shadow-card)]',
        elevated ? 'bg-[var(--surface-elevated)]' : 'bg-[var(--surface-card)]',
        lifts && 'card-lift hover:border-[var(--school-primary)]/30',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      // A clickable card is a button to everyone who isn't using a mouse.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          e.currentTarget.click()
        }
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Show validation text above the field (default: below). */
  errorPosition?: 'above' | 'below'
  hint?: string
  icon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, errorPosition = 'below', hint, icon, className, id, ...props }, ref) => {
    // Every field gets an id so its <label> is programmatically tied to it --
    // that is what lets a screen reader say "Email, edit text" instead of
    // just "edit text" -- and its error/hint is read with it.
    const autoId = React.useId()
    const inputId = id ?? autoId
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
    const errEl = error ? (
      <p id={`${inputId}-error`} role="alert" className="text-xs text-[#FF3355]">
        {error}
      </p>
    ) : null
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        {error && errorPosition === 'above' && errEl}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors',
              'focus:border-[var(--accent-default)] focus:ring-[3px] focus:ring-[var(--accent-default)]/15',
              error && 'border-[#FF3355] focus:border-[#FF3355] focus:ring-[#FF3355]/30',
              icon && 'pl-9',
              className,
            )}
            {...props}
          />
        </div>
        {error && errorPosition === 'below' && errEl}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-[var(--text-muted)]">
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ label, error, options, className, id, ...props }: SelectProps) {
  const autoId = React.useId()
  const selectId = id ?? autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(
          'w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors',
          'focus:border-[var(--accent-default)] focus:ring-[3px] focus:ring-[var(--accent-default)]/15',
          error && 'border-[#FF3355]',
          className,
        )}
        {...props}
      >
        {options.map((opt, i) => (
          <option key={`${i}:${opt.value}`} value={opt.value} className="bg-[var(--surface-card)]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} role="alert" className="text-xs text-[#FF3355]">
          {error}
        </p>
      )}
    </div>
  )
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const autoId = React.useId()
  const areaId = id ?? autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={areaId} className="text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <textarea
        id={areaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${areaId}-error` : undefined}
        className={cn(
          'w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors resize-none',
          'focus:border-[var(--accent-default)] focus:ring-[3px] focus:ring-[var(--accent-default)]/15',
          error && 'border-[#FF3355]',
          className,
        )}
        rows={4}
        {...props}
      />
      {error && (
        <p id={`${areaId}-error`} role="alert" className="text-xs text-[#FF3355]">
          {error}
        </p>
      )}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'school'
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  const variants = {
    default:
      'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]',
    // Tint stays vivid; the TEXT uses the per-theme ink so a badge is legible
    // on a light tint as well as a dark one (the vivid hue as text over
    // near-white measured about 3:1).
    success: 'bg-[var(--success)]/10 text-[var(--success-ink)] border border-[var(--success)]/20',
    warning: 'bg-[#FFB800]/10 text-[var(--warning-ink)] border border-[#FFB800]/25',
    danger: 'bg-[#FF3355]/10 text-[var(--danger-ink)] border border-[#FF3355]/25',
    info: 'bg-[#0066FF]/10 text-[var(--info-ink)] border border-[#0066FF]/25',
    school: 'bg-[var(--school-primary)] text-[var(--school-secondary)]',
  }
  const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-xs' }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Use `nested` when stacking a modal above another (higher z-index). */
  layer?: 'base' | 'nested'
}

// Open modals, oldest first. Escape closes only the top one, so a confirmation
// stacked on a form doesn't take the form down with it.
const openModals: symbol[] = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, children, size = 'md', layer = 'base' }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  React.useEffect(() => {
    if (!open) return
    const token = Symbol('modal')
    openModals.push(token)
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move focus into the dialog unless something inside already took it.
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus()

    const onKey = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== token) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null,
        )
        if (items.length === 0) {
          e.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const at = openModals.indexOf(token)
      if (at >= 0) openModals.splice(at, 1)
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-4xl',
  }
  return (
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-4',
        layer === 'nested' ? 'z-[60]' : 'z-50',
      )}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full max-h-[min(90vh,100dvh)] flex flex-col overflow-hidden bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl outline-none',
          sizes[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)] shrink-0">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--shell-hover)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div
          className={cn('p-5 overflow-y-auto min-h-0 flex-1')}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return <Loader2 className={cn(sizes[size], 'animate-spin text-[var(--accent-default)]', className)} />
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-[var(--surface-elevated)]', className)} />
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        className={cn(
          'relative w-10 h-5 rounded-full transition-colors duration-200',
          checked ? 'bg-[#0066FF]' : 'bg-[var(--surface-elevated)]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        onClick={() => !disabled && onChange(!checked)}
      >
        <div
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </div>
      {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
    </label>
  )
}

// ─── Alert ────────────────────────────────────────────────────────────────────
interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
  /** Accessible label for the dismiss control (default: "Dismiss"). */
  dismissAriaLabel?: string
  className?: string
}

export function Alert({
  type = 'info',
  title,
  children,
  onDismiss,
  dismissAriaLabel,
  className,
}: AlertProps) {
  // Tint stays vivid; text uses the per-theme ink (the vivid hue as text on a
  // light tint measured about 2:1 for the amber).
  const styles = {
    info: 'bg-[#0066FF]/8 border-[#0066FF]/25 text-[var(--info-ink)]',
    success: 'bg-[var(--success)]/10 border-[var(--success)]/25 text-[var(--success-ink)]',
    warning: 'bg-[#FFB800]/10 border-[#FFB800]/30 text-[var(--warning-ink)]',
    danger: 'bg-[#FF3355]/8 border-[#FF3355]/25 text-[var(--danger-ink)]',
  }
  return (
    <div className={cn('border rounded-xl p-4 flex gap-3 items-start', styles[type], className)}>
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm mb-1">{title}</p>}
        <div className="text-sm opacity-90">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissAriaLabel ?? 'Dismiss'}
          className="shrink-0 p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/15 transition-colors -mt-1 -mr-1 text-current"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {icon && <div className="text-5xl mb-4 opacity-50">{icon}</div>}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6">{description}</p>
      )}
      {action}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  className?: string
  /** When set, the card is keyboard-focusable and shows a pointer cursor. */
  onClick?: () => void
  /** Helper text under the value when `onClick` is provided (e.g. “Tap for details”). */
  interactiveHint?: string
}

export function StatCard({
  label,
  value,
  subValue,
  trend,
  trendValue,
  className,
  onClick,
  interactiveHint,
}: StatCardProps) {
  const trendColors = {
    up: 'text-[var(--success)]',
    down: 'text-[#FF3355]',
    neutral: 'text-[var(--text-muted)]',
  }
  const body = (
    <>
      <p className="text-[13px] font-medium text-[var(--text-muted)]">{label}</p>
      <p className="text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {(subValue || trendValue) && (
        <div className="flex items-center gap-2">
          {subValue && <p className="text-xs text-[var(--text-muted)]">{subValue}</p>}
          {trend && trendValue && (
            <span className={cn('text-xs font-semibold', trendColors[trend])}>
              {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '●'} {trendValue}
            </span>
          )}
        </div>
      )}
      {onClick && interactiveHint ? (
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{interactiveHint}</p>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)]',
          className,
        )}
      >
        <Card className="flex flex-col gap-1.5 h-full p-5 hover:border-[var(--accent-default)]/35 transition-colors cursor-pointer">
          {body}
        </Card>
      </button>
    )
  }

  return <Card className={cn('flex flex-col gap-1.5 p-5', className)}>{body}</Card>
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
interface TabBarProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Segmented control: a light track with the selected segment as a raised white chip. */
export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div
      className={cn(
        'flex gap-0.5 overflow-x-auto rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-0.5',
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-all duration-150',
            active === tab.id
              ? 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
interface TableProps {
  columns: { key: string; label: React.ReactNode; width?: string }[]
  data: Record<string, React.ReactNode>[]
  onRowClick?: (row: Record<string, React.ReactNode>, index: number) => void
  loading?: boolean
  emptyMessage?: string
}

export function Table({
  columns,
  data,
  onRowClick,
  loading,
  emptyMessage = 'No data found',
}: TableProps) {
  const last = columns.length - 1
  // Header is a rounded light band; body rows are open, split by hairlines.
  // `border-separate` is what lets the header cells carry rounded corners.
  const headCell = (i: number) =>
    cn(
      'h-10 border-y border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 text-left text-[13px] font-medium text-[var(--text-muted)] whitespace-nowrap',
      i === 0 && 'rounded-l-[10px] border-l',
      i === last && 'rounded-r-[10px] border-r',
    )
  const bodyCell = 'h-[52px] border-b border-[var(--border-subtle)] px-4 py-2.5'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={col.key} scope="col" className={headCell(i)} style={{ width: col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className={bodyCell}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-[var(--text-muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-[var(--surface-elevated)]',
                )}
                onClick={() => onRowClick?.(row, i)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          onRowClick(row, i)
                        }
                      }
                    : undefined
                }
              >
                {columns.map((col) => (
                  <td key={col.key} className={bodyCell}>
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
