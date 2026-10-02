import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Splits an already-filtered list into pages held in memory.
 *
 * The page snaps back to 1 whenever the number of results changes, so applying
 * a search or filter never leaves you on page 4 of a list that now has one page.
 */
export function usePagination<T>(items: T[], pageSize = 25) {
  const [state, setState] = useState({ page: 1, total: items.length })
  // Adjusting state while rendering is React's supported way to reset on a change.
  if (state.total !== items.length) setState({ page: 1, total: items.length })

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(state.page, pageCount)
  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  )

  return {
    pageItems,
    pagerProps: {
      page,
      pageCount,
      total: items.length,
      pageSize,
      onPage: (p: number) => setState((s) => ({ ...s, page: Math.min(Math.max(1, p), pageCount) })),
    },
  }
}

interface PaginationProps {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  className?: string
}

/** "Showing 1–25 of 120" with Previous / Next. Renders nothing for a single page. */
export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  className,
}: PaginationProps) {
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const btn =
    'inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 pt-2', className)}
    >
      <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </button>
        <span className="text-sm tabular-nums text-[var(--text-muted)]">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={btn}
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  )
}
