import React from 'react'
import { ArrowRight } from 'lucide-react'
import { useTourStore } from '../../../stores/tourStore'
import type { TourStepContext } from '../../../tours/types'

/**
 * Final step of the Super Admin tour. The detailed setup (athletes, teams,
 * events, brackets, live scoring) is normally the Organizer's and Coach's job,
 * so the tour can end here — but the professor wanted a Super Admin to be able
 * to walk the entire process in one sitting. Choosing to continue queues the
 * Organizer and Coach tours (see tourStore.queue + TourOverlay.exitTour), so
 * the footer's Finish hands off, and this button carries straight on.
 */
export default function HandoffChoiceStep({ ctx }: { ctx: TourStepContext }) {
  const setQueue = useTourStore((s) => s.setQueue)

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        The detailed setup — importing athletes, building teams, creating events and brackets, and
        live scoring — is normally the Organizer&apos;s and Coach&apos;s job.
      </p>
      <p className="text-sm text-[var(--text-secondary)]">
        Press <strong>Finish</strong> to hand off, or keep going and do it yourself now — the
        walkthrough continues through every Organizer and Coach step in one go.
      </p>
      <button
        type="button"
        onClick={() => {
          setQueue(['organizer', 'coach'])
          ctx.next()
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0052CC]"
      >
        Continue — set it all up myself
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}
