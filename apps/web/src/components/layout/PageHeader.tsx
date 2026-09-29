import React from 'react'
import { useLocation } from 'react-router'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { cn } from '../../lib/utils'
import { findNavItem, navForRole } from './navConfig'

type Props = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Right-aligned controls (the page's existing buttons / filters). */
  actions?: React.ReactNode
  /** A leading control before the tile, e.g. the page's existing back arrow. */
  back?: React.ReactNode
  /**
   * Tile icon. Defaults to the icon of the sidebar row this page belongs to;
   * a page with no row of its own (live scoring, match review…) gets none.
   * Pass `null` to suppress it.
   */
  icon?: LucideIcon | null
  /** Anything that sits under the subtitle (existing notes, badges). */
  children?: React.ReactNode
  className?: string
  [dataAttr: `data-${string}`]: string | undefined
}

/** Page title block: icon tile, title, muted subtitle, actions on the right. */
export default function PageHeader({
  title,
  subtitle,
  actions,
  back,
  icon,
  children,
  className,
  ...rest
}: Props) {
  const location = useLocation()
  const { profile, session } = useAuthStore()
  const role = sessionScopedProfile(session, profile)?.role
  const Icon = icon === undefined ? findNavItem(location.pathname, navForRole(role))?.icon : icon

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      {...rest}
    >
      <div className="flex min-w-0 items-start gap-4">
        {back}
        {Icon && (
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] text-white"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%), var(--school-primary)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(0,0,0,0.12), 0 8px 18px -8px rgba(var(--school-primary-rgb), 0.6)',
            }}
            aria-hidden
          >
            <Icon className="h-7 w-7" strokeWidth={2} />
          </div>
        )}
        <div className={cn('min-w-0', Icon && 'pt-1')}>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-[var(--text-primary)]">
            {title}
          </h1>
          {subtitle && <div className="mt-1.5 text-sm text-[var(--text-muted)]">{subtitle}</div>}
          {children}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A small ghost back arrow in the reference's style — wraps a page's existing back action. */
export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--text-primary)]"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden />
    </button>
  )
}
