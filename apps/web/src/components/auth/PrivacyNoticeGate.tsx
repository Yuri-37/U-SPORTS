import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { Button, Alert } from '../ui'
import api from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { PRIVACY_NOTICE_SECTIONS } from '../../lib/privacyNotice'
import type { Profile } from '../../types'

type Props = {
  profile: Profile
}

/**
 * Full-screen, non-dismissable — not the shared Modal, which allows
 * backdrop-click-to-close and has its own X button, both wrong for a
 * mandatory notice. Blocks App.tsx's <Outlet/> entirely until accepted.
 */
export default function PrivacyNoticeGate({ profile }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { fetchProfile, signOut } = useAuthStore()
  const navigate = useNavigate()

  const handleAgree = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/accept-privacy-notice')
      // Re-syncs profile.privacy_accepted_at in the store, which clears this gate.
      await fetchProfile(profile.id)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setError(msg ?? 'Could not save your response. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-primary)] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] my-auto">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center gap-3 shrink-0">
          <ShieldCheck className="w-6 h-6 text-[#0066FF] shrink-0" aria-hidden />
          <h1 className="text-lg font-bold">Your Privacy on U-Sports</h1>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 text-sm text-[var(--text-secondary)]">
          {PRIVACY_NOTICE_SECTIONS.map((section) => (
            <div key={section.heading}>
              {section.heading && (
                <p className="font-semibold text-[var(--text-primary)] mb-1">{section.heading}</p>
              )}
              <p className="whitespace-pre-line">{section.body}</p>
            </div>
          ))}
        </div>
        <div className="p-6 border-t border-[var(--border-subtle)] shrink-0 space-y-3">
          {error && <Alert type="danger">{error}</Alert>}
          <Button className="w-full" size="lg" loading={loading} onClick={handleAgree}>
            I Agree — Continue
          </Button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Not ready? Sign out instead
          </button>
        </div>
      </div>
    </div>
  )
}
