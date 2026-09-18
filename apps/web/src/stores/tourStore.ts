import { create } from 'zustand'
import type { TourId } from '../tours/types'

export type TourPhase = 'idle' | 'active' | 'paused'

interface TourState {
  activeTourId: TourId | null
  stepIndex: number
  phase: TourPhase
  canAdvance: boolean
  /**
   * Tours to run, in order, after the current one completes. Set when a Super
   * Admin chooses to do the whole setup in one go — the admin tour hands off
   * to ['organizer', 'coach']. Empty for a normal single-tour run.
   */
  queue: TourId[]
  /** Session-only — an exited tour shouldn't re-prompt before the server write lands. */
  dismissedThisSession: Set<TourId>
  start: (id: TourId, opts?: { fromStep?: number }) => void
  next: () => void
  prev: () => void
  setCanAdvance: (ok: boolean) => void
  setQueue: (ids: TourId[]) => void
  pause: () => void
  resume: () => void
  exit: (reason: 'completed' | 'skipped') => void
}

/**
 * Deliberately NOT `persist`-wrapped — the source of truth for "has this
 * tour been completed" is `profiles.tours_completed` on the server (see
 * routes/profile.ts), not localStorage, so it can't desync across devices
 * or resurrect after an admin resets a profile. This store only holds
 * transient "is a tour currently running" state.
 *
 * `phase` is deliberately coarse: 'waiting for target'/'settling'/'ready'
 * are per-step render nuances already exposed by useAnchor's own return
 * value, and don't need a second source of truth here. This store only
 * needs to know whether a tour is running at all, and whether the user
 * navigated away from it themselves (`paused`).
 */
export const useTourStore = create<TourState>()((set, get) => ({
  activeTourId: null,
  stepIndex: 0,
  phase: 'idle',
  canAdvance: true,
  queue: [],
  dismissedThisSession: new Set(),

  start: (id, opts) => {
    // Note: deliberately does NOT reset `queue` — chaining (see TourOverlay's
    // exitTour) shifts the queue and then calls start() for the next tour.
    set({ activeTourId: id, stepIndex: opts?.fromStep ?? 0, phase: 'active', canAdvance: true })
  },

  next: () => {
    set((s) => ({ stepIndex: s.stepIndex + 1, phase: 'active', canAdvance: true }))
  },

  prev: () => {
    set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1), phase: 'active', canAdvance: true }))
  },

  setCanAdvance: (ok) => set({ canAdvance: ok }),
  setQueue: (ids) => set({ queue: ids }),

  pause: () => set((s) => (s.activeTourId ? { phase: 'paused' } : s)),
  resume: () => set((s) => (s.activeTourId ? { phase: 'active' } : s)),

  // `reason` isn't read here — persisting completion happens in
  // TourOverlay's own exit handler *before* this is called, since that's
  // where authStore/API access lives. This just resets local UI state.
  exit: () => {
    const id = get().activeTourId
    set((s) => ({
      activeTourId: null,
      stepIndex: 0,
      phase: 'idle',
      queue: [],
      dismissedThisSession: id ? new Set(s.dismissedThisSession).add(id) : s.dismissedThisSession,
    }))
  },
}))
