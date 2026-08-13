import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Button, Input, Alert } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { friendlyAuthError } from '../../lib/utils'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { institution } = useInstitutionStore()
  // Supabase's client auto-parses the recovery link's URL fragment
  // (detectSessionInUrl: true in lib/supabase.ts) and fires this event once
  // that transient session is established — there's nothing to do until then.
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      setChecking(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
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
                  required
                />
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
