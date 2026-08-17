import React from 'react'
import { Compass, HelpCircle, RotateCcw } from 'lucide-react'
import { Card } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { useTourStore } from '../../stores/tourStore'
import { toursForRole } from '../../tours'
import { STAFF_MANUAL_SECTIONS } from '../../lib/staffManual'
import type { StaffRole } from '../../tours/types'

/** Reachable from every staff role's Settings page and a TopNav button —
 *  same component regardless of role, content adapts to whoever's signed in. */
export default function HelpCenter() {
  const { session, profile } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const start = useTourStore((s) => s.start)

  const STAFF_ROLES: StaffRole[] = ['Admin', 'Organizer', 'Coach']
  const role = STAFF_ROLES.includes(scopedProfile?.role as StaffRole)
    ? (scopedProfile!.role as StaffRole)
    : undefined
  const tours = role ? toursForRole(role) : []
  const sections = role ? STAFF_MANUAL_SECTIONS[role] : []

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-[var(--accent-default)]" aria-hidden />
          Help Center
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Guided tours and a quick reference for your role.
        </p>
      </div>

      <Card>
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Compass className="w-4 h-4 text-[var(--accent-default)]" aria-hidden />
          Guided tours
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Replay any time — the tour walks you through your actual dashboard, so nothing gets out of
          date.
        </p>
        <div className="space-y-2">
          {tours.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No guided tour for this role yet.</p>
          )}
          {tours.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{t.description}</p>
              </div>
              <button
                type="button"
                onClick={() => start(t.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0066FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0052CC] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Replay
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-bold text-lg mb-1">Quick reference</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          The limits and rules that come up most often.
        </p>
        <div className="space-y-4 text-sm">
          {sections.map((section) => (
            <div key={section.heading}>
              <p className="font-semibold text-[var(--text-primary)] mb-1">{section.heading}</p>
              <p className="text-[var(--text-secondary)] whitespace-pre-line">{section.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
