import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Button, Input, Alert, PasswordStrengthMeter } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { friendlyAuthError } from '../../lib/utils'
import { passwordZ } from '../../lib/validation/forms'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { institution } = useInstitutionStore()
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    let cleanup = () => {}

    const run = async () => {
      const query = new URLSearchParams(window.location.search)
      const tokenHash = query.get('token_hash')
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const linkError = hash.get('error_description') || hash.get('error')

      // New reset links carry a token_hash in the query, and we redeem it here
      // in JavaScript. A mail scanner (e.g. Outlook "Safe Links") that
      // pre-opens the link only fetches the page HTML and never runs this, so
      // the one-time token survives for the real person who clicks. We also
      // clear any existing login FIRST: this page must reflect the reset link
      // alone. The old code trusted any persisted session, so a signed-in user
      // clicking a dead link still saw the form and "updated" their live
      // session — appearing to work while doing the wrong thing.
      if (tokenHash) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        // Strip the token from the URL so a refresh or back-button can't replay it.
        window.history.replaceState({}, document.title, '/auth/reset-password')
        if (!active) return
        setReady(!verifyError)
        setChecking(false)
        return
      }

      // A failed/expired redirect leaves an error in the URL fragment. Show the
      // expired message — never fall back to a pre-existing login session.
      if (linkError) {
        if (!active) return
        setReady(false)
        setChecking(false)
        return
      }

      // Back-compat for links already sent in the older implicit-flow format:
      // the session arrives in the URL fragment and fires PASSWORD_RECOVERY.
      // A plain existing login (no recovery event) must NOT unlock the form.
      let recovered = false
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          recovered = true
          if (!active) return
          setReady(true)
          setChecking(false)
        }
      })
      cleanup = () => sub.subscription.unsubscribe()
      // If no recovery context materialises, this wasn't a valid reset link.
      setTimeout(() => {
        if (active && !recovered) setChecking(false)
      }, 3000)
    }

    void run()
    return () => {
      active = false
      cleanup()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const parsed = passwordZ.safeParse(password)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid password')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error(updateError.message)
      // The recovery session is transient — sign out and send them to a
      // normal login with the new password, rather than trying to route a
      // recovery session into role-specific post-login paths.
      await supabase.auth.signOut()
      setDone(true)
      setTimeout(() => navigate('/auth/login', { replace: true }), 2500)
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not update your password. Try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {institution?.logo_url ? (
            <img
              src={institution.logo_url}
              alt=""
              className="max-h-16 w-auto max-w-[12rem] mx-auto mb-3 object-contain object-center"
            />
          ) : null}
          <h1 className="text-2xl font-bold font-[Barlow_Condensed]">U-Sports</h1>
          <p className="text-[var(--text-muted)] text-sm">{institution?.name}</p>
        </div>

        {done ? (
          <Alert type="success">
            Password updated. Redirecting you to sign in with your new password…
          </Alert>
        ) : checking ? (
          <p className="text-center text-sm text-[var(--text-muted)]">Verifying your link…</p>
        ) : !ready ? (
          <Alert type="danger">
            This reset link is invalid or has expired. Request a new one from the{' '}
            <a href="/auth/forgot-password" className="underline">
              forgot password
            </a>{' '}
            page.
          </Alert>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1">Set a new password</h2>
            <p className="text-[var(--text-muted)] text-sm mb-6">
              Choose a new password for your account.
            </p>

            {error && (
              <Alert type="danger" className="mb-4">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  label="New password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock className="w-4 h-4" />}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
                <PasswordStrengthMeter password={password} />
                <button
                  type="button"
                  className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPass ? 'Hide' : 'Show'} password
                </button>
              </div>
              <Input
                label="Confirm new password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
                maxLength={128}
                required
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={loading}
                icon={<KeyRound className="w-4 h-4" />}
              >
                Update password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
