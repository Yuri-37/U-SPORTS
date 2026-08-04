import React, { useEffect, useState } from 'react'
import { AlertTriangle, X, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Announcement } from '../../types'
import { cn, formatDateTime } from '../../lib/utils'

export type AnnouncementBannerMode = 'banner' | 'hero_slider'

/** Organizer / athlete layouts show banner strips only. Guest hub passes hero_slider too. */
const DEFAULT_MODES: AnnouncementBannerMode[] = ['banner']

interface Props {
  publicOnly?: boolean
  modes?: readonly AnnouncementBannerMode[]
}

function modesFilterKey(modes: readonly AnnouncementBannerMode[]): string {
  return [...modes].sort().join(',')
}

function isFetchedBannerMode(
  mode: string,
  modes: readonly AnnouncementBannerMode[],
): mode is AnnouncementBannerMode {
  return modes.includes(mode as AnnouncementBannerMode)
}

function announcementHeading(a: Announcement): string {
  if (a.type === 'emergency') return a.title
  if (a.type === 'reschedule') return `📅 Rescheduled: ${a.title}`
  return a.title
}

/**
 * One copy of the ticker text.
 * min-w-screen ensures each copy is at least viewport-wide so the loop is seamless
 * even for short messages — the -50% translateX always moves exactly one copy off screen.
 */
function HeroTickerCopy({ a }: { a: Announcement }) {
  const isCritical = a.urgency === 'critical'
  return (
    <span
      className="inline-flex items-center gap-4 whitespace-nowrap px-16"
      style={{ minWidth: '100vw' }}
    >
      {isCritical ? (
        <AlertTriangle className="w-4 h-4 text-[var(--danger)] shrink-0" aria-hidden />
      ) : (
        <Clock className="w-4 h-4 text-[var(--warning)] shrink-0" aria-hidden />
      )}
      <span
        className={cn(
          'text-sm font-bold tracking-widest uppercase',
          isCritical ? 'text-[var(--danger)]' : 'text-[var(--warning)]',
        )}
      >
        {announcementHeading(a)}
      </span>
      <span className="text-sm text-[var(--text-secondary)]">{a.body}</span>
      {a.new_scheduled_at && (
        <span className="text-xs text-[var(--text-muted)]">
          New time: {formatDateTime(a.new_scheduled_at)}
          {a.new_venue ? ` · ${a.new_venue}` : ''}
        </span>
      )}
      {/* Decorative separator between loops */}
      <span className="text-[var(--text-muted)] opacity-30 text-lg" aria-hidden>
        ◆
      </span>
    </span>
  )
}

export default function AnnouncementBanner({ publicOnly, modes = DEFAULT_MODES }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const modesKey = modesFilterKey(modes)

  useEffect(() => {
    const modeList = [...modes]
    let query = supabase
      .from('announcements')
      .select('*')
      .in('display_mode', modeList)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('published_at', { ascending: false })

    if (publicOnly) {
      query = query.eq('is_public', true)
    }

    query.then(({ data }) => {
      setAnnouncements(data ?? [])
    })

    const channel = supabase
      .channel(`announcements-banner:${modesKey}:${publicOnly ? 'pub' : 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          const a = payload.new as Announcement
          if (!isFetchedBannerMode(a.display_mode, modes)) return
          if (!publicOnly || a.is_public) {
            setAnnouncements((prev) => [a, ...prev])
          }
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [publicOnly, modesKey, modes])

  const visible = announcements.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  const heroes = modes.includes('hero_slider')
    ? visible.filter((a) => a.display_mode === 'hero_slider')
    : []
  const banners = modes.includes('banner') ? visible.filter((a) => a.display_mode === 'banner') : []

  const urgencyBarClass = (urgency: Announcement['urgency']) =>
    urgency === 'critical'
      ? 'bg-[var(--danger)]/15 border-b border-[var(--danger)]/30'
      : 'bg-[var(--warning)]/10 border-b border-[var(--warning)]/30'

  return (
    <div className="z-20">
      {/*
        Hero slider — no dismiss button.
        The outer div is a plain block with overflow-hidden; the inner inline-flex
        carries two identical copies. translate(-50%) shifts by exactly one copy's
        width for a perfectly seamless loop.
      */}
      {heroes.map((a) => (
        <div
          key={a.id}
          className={cn('animate-slide-down', urgencyBarClass(a.urgency))}
          style={{ overflow: 'hidden' }}
        >
          {/*
            Inline style drives the animation so it cannot be suppressed by any
            @media (prefers-reduced-motion) rule in CSS — inline styles always win.
          */}
          <div
            style={{
              display: 'inline-flex',
              animation: 'ticker-scroll 14s linear infinite',
            }}
          >
            <HeroTickerCopy a={a} />
            <HeroTickerCopy a={a} />
          </div>
        </div>
      ))}

      {/* Static strip — dismissable with X */}
      {banners.map((a) => (
        <div
          key={a.id}
          className={cn(
            'flex items-start gap-3 px-6 py-3 text-sm animate-slide-down',
            urgencyBarClass(a.urgency),
          )}
        >
          {a.urgency === 'critical' ? (
            <AlertTriangle className="w-4 h-4 text-[var(--danger)] flex-shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-4 h-4 text-[var(--warning)] flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                'font-semibold mr-2',
                a.urgency === 'critical' ? 'text-[var(--danger)]' : 'text-[var(--warning)]',
              )}
            >
              {announcementHeading(a)}
            </span>
            <span className="text-[var(--text-secondary)]">{a.body}</span>
            {a.new_scheduled_at && (
              <span className="ml-2 text-[var(--text-muted)] text-xs">
                New time: {formatDateTime(a.new_scheduled_at)}
                {a.new_venue && ` · ${a.new_venue}`}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDismissed((prev) => new Set([...prev, a.id]))}
            className="text-[var(--text-muted)] hover:text-white transition-colors flex-shrink-0"
            aria-label="Dismiss announcement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
