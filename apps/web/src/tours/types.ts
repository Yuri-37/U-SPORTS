import type { ReactNode } from 'react'
import type { Side } from '../components/tour/placement'

export type TourId = 'admin' | 'organizer' | 'coach'
export type StaffRole = 'Admin' | 'Organizer' | 'Coach'

export interface TourStepContext {
  next: () => void
  prev: () => void
  exit: (reason: 'completed' | 'skipped') => void
  /** Gate the Next button — used by the placeholder-generator step. */
  setCanAdvance: (ok: boolean) => void
  index: number
  total: number
}

export interface TourStep {
  id: string
  /** Ordered fallback chain of CSS selectors. Omit for an intro/outro step → centered card. */
  target?: string | string[]
  /** Navigate here first if the current route doesn't match. */
  route?: string
  title: string
  body?: ReactNode
  /** Custom interactive content (e.g. the placeholder generator form). Takes precedence over `body`. */
  render?: (ctx: TourStepContext) => ReactNode
  placement?: Side | 'auto'
  size?: 'sm' | 'md' | 'lg'
  /** Default true. false → silently auto-skip if the target never appears. */
  required?: boolean
  /** Punches a real hole in the blocker so the target stays clickable. */
  interactive?: boolean
  waitMs?: number
}

export interface TourDefinition {
  id: TourId
  /** Bump to re-show a tour after a redesign — compared against the stored completion version. */
  version: number
  label: string
  description: string
  roles: StaffRole[]
  steps: TourStep[]
}
