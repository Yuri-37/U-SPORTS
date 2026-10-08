import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { Button } from '../ui'
import { GUEST_PRIVACY_SUMMARY } from '../../lib/privacyNotice'

/**
 * The privacy notice for people browsing without an account.
 *
 * Signed-in users meet the full notice at PrivacyNoticeGate and their
 * acceptance is stored on their profile. A guest has no profile to store
 * anything on, so this is an acknowledgement kept on their own device —
 * which is also the honest thing to say in the notice itself.
 *
 * It sits above the page rather than blocking it: a shared scoreboard link
 * should still open on a scoreboard.
 */

const ACK_KEY = 'u-sports-guest-privacy-ack'
// Bump when the notice changes materially, so guests are shown it again.
const ACK_VERSION = '2026-10'

export default function GuestPrivacyNotice() {
  // Starts hidden: reading storage during render would flash the bar for
  // someone who already dismissed it.
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(ACK_KEY) !== ACK_VERSION) setShow(true)
    } catch {
      // Private mode or blocked storage — show it, and accept that the
      // acknowledgement will not stick.
      setShow(true)
    }
  }, [])

  if (!show) return null

  const acknowledge = () => {
    try {
      localStorage.setItem(ACK_KEY, ACK_VERSION)
    } catch {
      // Nothing to do — it simply appears again next visit.
    }
    setShow(false)
  }

  return (
    <div
      role="region"
      aria-label="Privacy notice"
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-frame)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <ShieldCheck className="w-6 h-6 shrink-0 text-[#0066FF]" aria-hidden />
        <p className="flex-1 text-sm text-[var(--text-secondary)] leading-relaxed">
          {GUEST_PRIVACY_SUMMARY}{' '}
          <Link to="/privacy-notice" className="text-[#0066FF] hover:underline font-medium">
            Read the privacy notice
          </Link>
        </p>
        <Button className="shrink-0 w-full sm:w-auto" onClick={acknowledge}>
          I understand
        </Button>
      </div>
    </div>
  )
}
