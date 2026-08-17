import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { X, ChevronLeft, ChevronRight, Compass } from 'lucide-react'
import { useTourStore } from '../../stores/tourStore'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { TOURS, tourForRole } from '../../tours'
import type { TourStep, TourStepContext } from '../../tours/types'
import { useAnchor } from './useAnchor'
import { computePlacement } from './placement'
import api from '../../lib/api'
import { cn } from '../../lib/utils'

const AUTO_START_DELAY_MS = 600

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function routeMatches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

const PUBLIC_ROUTE_PREFIXES = ['/guest', '/auth', '/jumbotron', '/privacy-notice']

function isPublicRoute(pathname: string): boolean {
  return (
    pathname === '/' || pathname === '/super-admin/login' ||
    PUBLIC_ROUTE_PREFIXES.some((p) => pathname.startsWith(p))
  )
}

async function persistTourCompletion(tourId: string, version: number, reason: 'completed' | 'skipped') {
  try {
    return await api.post<{ tours_completed: Record<string, { at: string; version: number }> }>(
      '/profile/tour-completion',
      { tour_id: tourId, version, reason },
    )
  } catch {
    return null // best-effort — a failed write just means the tour may auto-start again next visit
  }
}

export default function TourOverlay() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, profile, setProfile } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)

  const {
    activeTourId,
    stepIndex,
    phase,
    canAdvance,
    dismissedThisSession,
    start,
    next,
    prev,
    setCanAdvance,
    pause,
    resume,
    exit,
  } = useTourStore()

  const tourNavRef = useRef<string | null>(null)
  const startedAutoRef = useRef(false)
  const deepLinkHandledRef = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<Element | null>(null)
  const prevPathnameRef = useRef(location.pathname)
  const [cardSize, setCardSize] = useState({ width: 320, height: 160 })
  const [reduceMotion, setReduceMotion] = useState(false)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

  const def = activeTourId ? TOURS[activeTourId] : null
  const step: TourStep | null = def ? (def.steps[stepIndex] ?? null) : null
  const total = def?.steps.length ?? 0

  const targets = step?.target ? (Array.isArray(step.target) ? step.target : [step.target]) : undefined
  const justNavigated = tourNavRef.current !== null
  const anchor = useAnchor(step ? targets : undefined, { justNavigated, waitMs: step?.waitMs })

  // ─── prefers-reduced-motion (subscribe, not a one-shot read) ──────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ─── viewport tracking ──────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const exitTour = useCallback(
    (reason: 'completed' | 'skipped') => {
      const finishedId = activeTourId
      const finishedDef = finishedId ? TOURS[finishedId] : null
      exit(reason)
      if (finishedId && finishedDef) {
        void persistTourCompletion(finishedId, finishedDef.version, reason).then((res) => {
          if (res?.data?.tours_completed && profile) {
            setProfile({ ...profile, tours_completed: res.data.tours_completed })
          }
        })
      }
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus({ preventScroll: true })
      }
    },
    [activeTourId, exit, profile, setProfile],
  )

  // ─── auto-start, once per session, after the dashboard has had a moment to paint ──
  useEffect(() => {
    if (startedAutoRef.current || activeTourId) return
    if (!scopedProfile || !scopedProfile.privacy_accepted_at) return
    if (isPublicRoute(location.pathname)) return

    const eligible = tourForRole(scopedProfile.role)
    if (!eligible) return
    const completed = scopedProfile.tours_completed?.[eligible.id]
    if (completed && completed.version >= eligible.version) return
    if (dismissedThisSession.has(eligible.id)) return

    startedAutoRef.current = true
    const timer = window.setTimeout(() => {
      previouslyFocusedRef.current = document.activeElement
      start(eligible.id)
    }, AUTO_START_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [scopedProfile, activeTourId, location.pathname, dismissedThisSession, start])

  // ─── ?tour=<id> deep link (Help Center replay lands here via query string) ──
  useEffect(() => {
    if (deepLinkHandledRef.current || activeTourId) return
    if (!scopedProfile) return
    const params = new URLSearchParams(location.search)
    const requested = params.get('tour')
    if (!requested) return
    deepLinkHandledRef.current = true
    const def = TOURS[requested as keyof typeof TOURS]
    if (def && def.roles.includes(scopedProfile.role as (typeof def.roles)[number])) {
      previouslyFocusedRef.current = document.activeElement
      start(def.id)
    }
    // Strip the param either way so re-navigating here doesn't re-trigger it.
    params.delete('tour')
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true })
  }, [location.pathname, location.search, scopedProfile, activeTourId, start, navigate])

  // Separate effect purely to catch navigation the *user* initiated mid-step.
  // Declared BEFORE the route-driven effect below and must stay that way: when
  // a step's own navigate() is still resolving (lazy chunk still loading) and
  // the tour advances to a routeless step before it lands, this effect needs
  // to see `tourNavRef.current` still set (our nav, not the user's) before the
  // route-driven effect below clears it for the new, routeless step. Reversing
  // the order re-introduces a spurious pause on that race.
  useEffect(() => {
    if (prevPathnameRef.current === location.pathname) return
    const changed = location.pathname
    prevPathnameRef.current = changed
    if (!activeTourId || !step) return
    if (step.route && routeMatches(changed, step.route)) return // landed where the tour wanted
    if (tourNavRef.current) return // our own navigate() is still resolving
    pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // ─── route-driven steps: navigate if needed ──
  useEffect(() => {
    if (!activeTourId || !step) return
    const path = location.pathname

    if (step.route && !routeMatches(path, step.route)) {
      if (tourNavRef.current === step.route) return // already in flight
      tourNavRef.current = step.route
      navigate(step.route)
      return
    }
    tourNavRef.current = null
    if (phase === 'paused') resume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTourId, step, location.pathname])

  // ─── keyboard: Escape exits, arrows step (never inside an input) ──────────
  useEffect(() => {
    if (!activeTourId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        exitTour('skipped')
        return
      }
      if (isEditableTarget(e.target)) return
      if (e.key === 'ArrowRight' && canAdvance) {
        if (stepIndex >= total - 1) exitTour('completed')
        else next()
      } else if (e.key === 'ArrowLeft' && stepIndex > 0) {
        prev()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTourId, canAdvance, stepIndex, total, next, prev, exitTour])

  // ─── measure the card, two-pass (hidden -> read -> commit) to avoid an origin flash ──
  // No dependency array: this must re-run on every render (card content changes size
  // per step). It bails out via functional setState when the measurement is unchanged
  // — without that, a fresh `{width, height}` object every render would fail React's
  // Object.is bailout and re-render forever ("Maximum update depth exceeded").
  useLayoutEffect(() => {
    if (!cardRef.current) return
    const el = cardRef.current
    const measure = () => {
      const width = el.offsetWidth
      const height = el.offsetHeight
      setCardSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })

  // ─── scroll the target into view once found, then focus the card ─────────
  useEffect(() => {
    if (anchor.status !== 'found' || !anchor.element) return
    const rect = anchor.element.getBoundingClientRect()
    const inView =
      rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
    if (!inView) {
      anchor.element.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    }
  }, [anchor.status, anchor.element, reduceMotion])

  useEffect(() => {
    if (!step) return
    cardRef.current?.focus({ preventScroll: true })
  }, [step?.id])

  // Memoized so a step's `render(ctx)` — e.g. PlaceholderGeneratorStep's
  // `useEffect(..., [ctx])` — doesn't see a new reference on every render.
  // An unmemoized ctx here previously caused an infinite render loop: the
  // effect fires on the "new" ctx, calls setCanAdvance, Zustand's un-selected
  // useTourStore() re-renders TourOverlay, which builds a new ctx, forever.
  const ctx: TourStepContext = useMemo(
    () => ({
      next: () => (stepIndex >= total - 1 ? exitTour('completed') : next()),
      prev,
      exit: exitTour,
      setCanAdvance,
      index: stepIndex,
      total,
    }),
    [stepIndex, total, exitTour, next, prev, setCanAdvance],
  )

  if (!activeTourId || !def || !step) return null

  if (phase === 'paused') {
    return (
      <button
        type="button"
        onClick={() => {
          resume()
          if (step.route) {
            tourNavRef.current = step.route
            navigate(step.route)
          }
        }}
        className="fixed bottom-5 right-5 z-[200] flex items-center gap-2 rounded-full bg-[#0066FF] px-4 py-2.5 text-sm font-semibold text-white shadow-2xl shadow-blue-900/40 hover:bg-[#0052CC] transition-colors"
      >
        <Compass className="w-4 h-4" />
        Resume tour · Step {stepIndex + 1} of {total}
      </button>
    )
  }

  const showSpotlight = anchor.status === 'found' && anchor.rect !== null
  const placement = computePlacement(
    anchor.status === 'found' && anchor.rect ? anchor.rect : { top: 0, left: 0, width: 0, height: 0 },
    cardSize,
    viewport,
    !showSpotlight ? 'center' : step.placement === 'auto' || !step.placement ? 'bottom' : step.placement,
  )

  const sizeClass = step.size === 'lg' ? 'max-w-lg' : step.size === 'sm' ? 'max-w-xs' : 'max-w-sm'

  return (
    <div aria-live="polite">
      {/* Blocker — swallows clicks outside the hole. Interactive steps use 4
          rects to leave the target itself reachable. */}
      {step.interactive && anchor.rect ? (
        <>
          <div
            className="fixed z-[190]"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, anchor.rect.top - 6) }}
          />
          <div
            className="fixed z-[190]"
            style={{
              top: Math.max(0, anchor.rect.top - 6),
              left: 0,
              width: Math.max(0, anchor.rect.left - 6),
              height: anchor.rect.height + 12,
            }}
          />
          <div
            className="fixed z-[190]"
            style={{
              top: Math.max(0, anchor.rect.top - 6),
              left: anchor.rect.left + anchor.rect.width + 6,
              right: 0,
              height: anchor.rect.height + 12,
            }}
          />
          <div
            className="fixed z-[190]"
            style={{
              top: anchor.rect.top + anchor.rect.height + 6,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 z-[190]" onClick={() => cardRef.current?.focus({ preventScroll: true })} />
      )}

      {/* Spotlight — visual only, never hit-tests */}
      {showSpotlight && anchor.rect && (
        <div
          className="fixed z-[195] rounded-[10px] border-2 border-[#0066FF] pointer-events-none"
          style={{
            top: anchor.rect.top - 6,
            left: anchor.rect.left - 6,
            width: anchor.rect.width + 12,
            height: anchor.rect.height + 12,
            boxShadow: '0 0 0 100vmax rgba(0,0,0,.6)',
            transition: reduceMotion ? undefined : 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
          }}
        />
      )}
      {!showSpotlight && <div className="fixed inset-0 z-[195] bg-black/60 pointer-events-none" />}

      {/* Card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={!step.interactive}
        aria-labelledby="tour-step-title"
        tabIndex={-1}
        className={cn(
          'fixed z-[200] w-[calc(100vw-32px)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl outline-none',
          sizeClass,
        )}
        style={{
          top: placement.top,
          left: placement.left,
          visibility: cardSize.width && cardSize.height ? 'visible' : 'hidden',
          transition: reduceMotion ? undefined : 'top .18s ease, left .18s ease',
        }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Step {stepIndex + 1} of {total}
          </span>
          <button
            type="button"
            onClick={() => exitTour('skipped')}
            aria-label="Skip tutorial"
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-2 pb-4">
          <h2 id="tour-step-title" className="text-base font-bold mb-1.5">
            {step.title}
          </h2>
          {step.render ? step.render(ctx) : step.body && <div className="text-sm text-[var(--text-secondary)]">{step.body}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-5 py-3">
          <button
            type="button"
            onClick={() => exitTour('skipped')}
            className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Skip tutorial
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={prev}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => (stepIndex >= total - 1 ? exitTour('completed') : next())}
              className="flex items-center gap-1 rounded-lg bg-[#0066FF] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {stepIndex >= total - 1 ? 'Finish' : 'Next'}
              {stepIndex < total - 1 && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
