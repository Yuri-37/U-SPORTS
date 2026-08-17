import React from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui'
import { PRIVACY_NOTICE_SECTIONS } from '../lib/privacyNotice'

/** Read-only — no accept action. Lets a user (or anyone) see the notice
 * again without re-triggering PrivacyNoticeGate's blocking flow. Public,
 * not auth-gated, same as most privacy-policy pages. */
export default function PrivacyNoticePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex justify-center p-4">
      <div className="w-full max-w-2xl py-8">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          Back
        </Button>
        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl">
          <div className="p-6 border-b border-[var(--border-subtle)] flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[#0066FF] shrink-0" aria-hidden />
            <h1 className="text-lg font-bold">Your Privacy on U-Sports</h1>
          </div>
          <div className="p-6 space-y-4 text-sm text-[var(--text-secondary)]">
            {PRIVACY_NOTICE_SECTIONS.map((section, i) => (
              <div key={i}>
                {section.heading && (
                  <p className="font-semibold text-[var(--text-primary)] mb-1">
                    {section.heading}
                  </p>
                )}
                <p className="whitespace-pre-line">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
