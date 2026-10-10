import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './index'

export type RowAction = {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  /** Red: removes or locks something. In the menu these always sit last. */
  destructive?: boolean
  disabled?: boolean
  /** Hover text; handy to say why an action is disabled. */
  title?: string
}

interface RowActionsProps {
  /** What the actions are for ("Yuri Dacuba"), so screen readers can tell the rows apart. */
  label: string
  /** Buttons shown in the row. Keep to the one or two actions people use most. */
  primary?: RowAction[]
  /** Everything else, behind a "more" button. Destructive items are red and last. */
  more?: RowAction[]
  /** An extra inline control (for example a workflow button) between the buttons and the menu. */
  children?: React.ReactNode
  className?: string
}

const ICON = 'w-3.5 h-3.5'
const DESTRUCTIVE_TEXT =
  'text-[var(--danger-ink)] hover:text-[var(--danger-ink)] hover:bg-[var(--danger)]/10'

/**
 * The one way a list row offers Edit / Delete / and the rest.
 *
 * Every list uses the same shape: the main action(s) as ghost buttons with an
 * icon, right-aligned and never wrapping, then a "more" menu for the rest.
 * Before this each table and card laid its buttons out differently (text links,
 * icon buttons, two rows), so the same action looked different from page to page.
 */
export default function RowActions({ label, primary = [], more = [], children, className }: RowActionsProps) {
  return (
    <div className={cn('flex items-center justify-end gap-1 whitespace-nowrap', className)}>
      {primary.map((a) => {
        const Icon = a.icon
        return (
          <Button
            key={a.label}
            type="button"
            size="sm"
            variant="ghost"
            disabled={a.disabled}
            title={a.title}
            icon={Icon ? <Icon className={ICON} aria-hidden /> : undefined}
            className={a.destructive ? DESTRUCTIVE_TEXT : undefined}
            onClick={a.onSelect}
          >
            {a.label}
          </Button>
        )
      })}
      {children}
      {more.length > 0 && <MoreMenu label={label} items={more} />}
    </div>
  )
}

function MoreMenu({ label, items }: { label: string; items: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    setPos(null)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // Put the menu under the button with their right edges lined up; flip it above
  // when there is no room below. It is drawn in a portal at the page level, so a
  // table's own scroll area cannot clip it.
  const place = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const r = trigger.getBoundingClientRect()
    // The button scrolled out of sight: nothing left for the menu to hang from.
    if (r.bottom < 0 || r.top > window.innerHeight) {
      close(false)
      return
    }
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const gap = 4
    const margin = 8
    const left = Math.min(Math.max(margin, r.right - width), window.innerWidth - width - margin)
    const below = r.bottom + gap
    const up = below + height > window.innerHeight - margin && r.top - gap - height >= margin
    setPos({ left, top: up ? r.top - gap - height : below, up })
  }, [close])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // Hand the keyboard to the first usable item as soon as the menu is placed.
  const placed = pos !== null
  useEffect(() => {
    if (!open || !placed) return
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus({
      preventScroll: true,
    })
  }, [open, placed])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    // Scrolling or resizing moves the button, so the menu follows it (a wheel
    // still gliding when the button is clicked must not make the menu vanish).
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, close, place])

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
      return
    }
    if (e.key === 'Tab') {
      // Back to the button, so Tab carries on from the row instead of from nowhere.
      close(true)
      return
    }
    const enabled = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [],
    )
    if (enabled.length === 0) return
    const at = enabled.indexOf(document.activeElement as HTMLButtonElement)
    let next = -1
    if (e.key === 'ArrowDown') next = (at + 1) % enabled.length
    else if (e.key === 'ArrowUp') next = (at - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    if (next >= 0) {
      e.preventDefault()
      enabled[next].focus()
    }
  }

  const firstDestructive = items.findIndex((a) => a.destructive)
  const showDivider = firstDestructive > 0

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="px-2"
        aria-label={`More actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="More actions"
        icon={<MoreHorizontal className="w-4 h-4" aria-hidden />}
        onClick={(e) => {
          triggerRef.current = e.currentTarget
          if (open) close(false)
          else setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            triggerRef.current = e.currentTarget
            setOpen(true)
          }
        }}
      />
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${label}`}
            onKeyDown={onMenuKeyDown}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            className={cn(
              'fixed z-[70] w-52 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] py-1 shadow-2xl menu-pop',
              pos?.up ? 'origin-bottom-right' : 'origin-top-right',
            )}
          >
            {items.map((a, i) => {
              const Icon = a.icon
              return (
                <React.Fragment key={a.label}>
                  {showDivider && i === firstDestructive && (
                    <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={a.disabled}
                    title={a.title}
                    onClick={() => {
                      // Focus goes back to the button first, so a dialog this opens
                      // returns focus there when it closes.
                      close(true)
                      a.onSelect()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                      a.destructive
                        ? 'text-[var(--danger-ink)] hover:bg-[var(--danger)]/10 focus-visible:bg-[var(--danger)]/10'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--surface-elevated)] focus-visible:text-[var(--text-primary)]',
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
                    {a.label}
                  </button>
                </React.Fragment>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
