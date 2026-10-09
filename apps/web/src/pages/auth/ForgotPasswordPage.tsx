import React, { useState } from 'react'
import { Mail, ArrowLeft, Send } from 'lucide-react'
import { Button, Input, Alert } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { friendlyAuthError } from '../../lib/utils'
import { suggestSchoolEmail } from '../../lib/emailTypo'
import UsportsMark from '../../components/brand/UsportsMark'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const { institution } = useInstitutionStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const trimmed = email.trim()
      if (!trimmed) throw new Error('Enter your email address')
      // A typo'd domain would "succeed" and send nothing -- stop and offer the fix.
      const fixed = suggestSchoolEmail(trimmed)
      if (fixed) {
        setSuggestion(fixed)
        return
      }
      setSuggestion(null)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (resetError) throw new Error(resetError.message)
      // Always show success, even if the address doesn't exist — otherwise
      // this becomes a way to check which emails are registered.
      setSent(true)
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not send the reset link. Try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <UsportsMark size={28} />
            <h1 className="text-2xl font-bold font-[Barlow_Condensed]">U-Sports</h1>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            {institution?.logo_url ? (
              <img
                src={institution.logo_url}
                alt=""
                className="h-6 w-auto max-w-[2rem] object-contain object-center"
              />
            ) : null}
            <p className="text-[var(--text-muted)] text-sm">{institution?.name}</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <Alert type="success">
              If an account exists for <strong>{email.trim()}</strong>, a password reset link has
              been sent. Check your inbox (and spam folder) — it may take a few minutes.
            </Alert>
            <p className="text-xs text-[var(--text-muted)]">Only the newest reset email works: asking for another one cancels the link in any earlier email.</p>
            <a
              href="/auth/login"
              className="flex items-center justify-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </a>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1">Forgot password</h2>
            <p className="text-[var(--text-muted)] text-sm mb-6">
              Enter your email and we'll send you a link to reset your password. If your account
              was created without a working email on file, ask your organizer to reset it for you
              instead.
            </p>

            {error && (
              <Alert type="danger" className="mb-4">
                {error}
              </Alert>
            )}

            {suggestion && (
              <Alert type="warning" className="mb-4">
                <span className="block">
                  That email address looks mistyped. Did you mean{' '}
                  <strong className="break-all">{suggestion}</strong>?
                </span>
                <button
                  type="button"
                  className="mt-2 underline font-semibold"
                  onClick={() => {
                    setEmail(suggestion)
                    setSuggestion(null)
                  }}
                >
                  Use {suggestion}
                </button>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="yourname@nu-dasma.edu.ph"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setSuggestion(null)
                }}
                icon={<Mail className="w-4 h-4" />}
                required
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={loading}
                icon={<Send className="w-4 h-4" />}
              >
                Send reset link
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <a
                href="/auth/login"
                className="flex items-center justify-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
