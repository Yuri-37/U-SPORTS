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
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none'
  const variants = {
    primary: 'bg-[#0066FF] hover:bg-[#0052CC] text-white shadow-lg shadow-blue-900/30',
    secondary:
      'bg-[var(--surface-elevated)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)]',
    danger: 'bg-[#FF3355] hover:bg-[#CC2244] text-white shadow-lg shadow-red-900/30',
    ghost:
      'bg-transparent hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    outline:
      'bg-transparent border border-[var(--border-subtle)] hover:border-[var(--text-muted)] text-[var(--text-primary)]',
    success: 'bg-[var(--success)] hover:opacity-90 text-white shadow-lg shadow-green-900/30',
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
}

export function Card({ children, className, elevated, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-subtle)] p-4',
        elevated ? 'bg-[var(--surface-elevated)]' : 'bg-[var(--surface-card)]',
        onClick && 'cursor-pointer hover:border-[var(--accent-default)]/35 transition-colors',
        className,
      )}
      onClick={onClick}
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
  ({ label, error, errorPosition = 'below', hint, icon, className, ...props }, ref) => {
    const errEl = error ? <p className="text-xs text-[#FF3355]">{error}</p> : null
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>
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
            className={cn(
              'w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors',
              'focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF]/30',
              error && 'border-[#FF3355] focus:border-[#FF3355] focus:ring-[#FF3355]/30',
              icon && 'pl-9',
              className,
            )}
            {...props}
          />
        </div>
        {error && errorPosition === 'below' && errEl}
        {hint && !error && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
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

export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>}
      <select
        className={cn(
          'w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors',
          'focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF]/30',
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
      {error && <p className="text-xs text-[#FF3355]">{error}</p>}
    </div>
  )
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>}
      <textarea
        className={cn(
          'w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors resize-none',
          'focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF]/30',
          error && 'border-[#FF3355]',
          className,
        )}
        rows={4}
        {...props}
      />
      {error && <p className="text-xs text-[#FF3355]">{error}</p>}
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
    success: 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20',
    warning: 'bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20',
    danger: 'bg-[#FF3355]/10 text-[#FF3355] border border-[#FF3355]/20',
    info: 'bg-[#0066FF]/10 text-[#0066FF] border border-[#0066FF]/20',
    school: 'bg-[var(--school-primary)] text-[var(--school-secondary)]',
  }
  const sizes = { sm: 'px-1.5 py-0.5 text-xs', md: 'px-2.5 py-1 text-xs' }
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md',
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

export function Modal({ open, onClose, title, children, size = 'md', layer = 'base' }: ModalProps) {
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
        className={cn(
          'relative w-full max-h-[min(90vh,100dvh)] flex flex-col overflow-hidden bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl',
          sizes[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] shrink-0">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded"
            >
              ✕
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
  return <Loader2 className={cn(sizes[size], 'animate-spin text-[#0066FF]', className)} />
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
  const styles = {
    info: 'bg-[#0066FF]/10 border-[#0066FF]/30 text-[#4D94FF]',
    success: 'bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]',
    warning: 'bg-[#FFB800]/10 border-[#FFB800]/30 text-[#FFB800]',
    danger: 'bg-[#FF3355]/10 border-[#FF3355]/30 text-[#FF3355]',
  }
  return (
    <div className={cn('border rounded-lg p-4 flex gap-3 items-start', styles[type], className)}>
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
      <h3 className="text-lg font-bold text-[var(--text-secondary)] mb-2">{title}</h3>
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
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold font-[Barlow_Condensed]">{value}</p>
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
          'w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF]',
          className,
        )}
      >
        <Card className="flex flex-col gap-1 h-full hover:border-[var(--accent-default)]/35 transition-colors cursor-pointer">
          {body}
        </Card>
      </button>
    )
  }

  return <Card className={cn('flex flex-col gap-1', className)}>{body}</Card>
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
interface TabBarProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div className={cn('flex gap-1 bg-[var(--surface-elevated)] p-1 rounded-lg', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150',
            active === tab.id
              ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow border border-[var(--border-subtle)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
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
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--border-subtle)]">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
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
                  'border-b border-[var(--border-subtle)] bg-[var(--surface-card)] transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-[var(--surface-elevated)]',
                )}
                onClick={() => onRowClick?.(row, i)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
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
