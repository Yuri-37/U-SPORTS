import React from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToastStore, type ToastKind } from '../../stores/toastStore'
import { cn } from '../../lib/utils'

const STYLE: Record<ToastKind, { icon: React.ElementType; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-[var(--success)]/40', iconColor: 'text-[var(--success)]' },
  error: { icon: XCircle, ring: 'border-[var(--danger)]/40', iconColor: 'text-[var(--danger)]' },
  info: { icon: Info, ring: 'border-[var(--accent-default)]/40', iconColor: 'text-[var(--accent-default)]' },
}

/** Renders the toast stack. Mount once inside the signed-in layout. */
export default function ToastHost() {
  const { items, dismiss } = useToastStore()
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4"
      // Announced politely by screen readers without stealing focus.
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const s = STYLE[t.kind]
        const Icon = s.icon
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-[var(--surface-card)] px-3.5 py-3 text-sm text-[var(--text-primary)] shadow-2xl toast-enter',
              s.ring,
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.iconColor)} aria-hidden />
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
