import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Button, Input, Alert, PasswordStrengthMeter } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { friendlyAuthError } from '../../lib/utils'
import { passwordZ } from '../../lib/validation/forms'
import UsportsMark from '../../components/brand/UsportsMark'

// Where invited accounts land after clicking the invite email link. The link
// carries a token_hash in the query. It is redeemed only after the person
// presses Continue (see ResetPasswordPage): mail scanners run the page's script
// and used the token up before anyone clicked. A pre-existing login can never
// be mistaken for the invite session either.
export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const { institution } = useInstitutionStore()
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  /** token_hash from the link, held until the person presses Continue. */
  const [pendingHash, setPendingHash] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
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

      if (tokenHash) {
      // The one-time token is NOT redeemed here. Microsoft's mail scanner (NU's
      // Defender "Safe Links") opens links in a real browser that runs this
      // script, and redeemed the token within seconds of sending -- long before
      // the person clicked -- so every link arrived already used. Redeeming only
      // after a person presses the button below means the scanner's visit leaves
      // the token intact.
        if (!active) return
        setPendingHash(tokenHash)
        setChecking(false)
        return
      }

      if (linkError) {
        if (!active) return
        setReady(false)
        setChecking(false)
        return
      }

      // Back-compat for older implicit-flow invite links (session in the URL
      // fragment, fires SIGNED_IN). A plain existing login must not count.
      let redeemed = false
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
          redeemed = true
          if (!active) return
          setReady(true)
          setChecking(false)
        }
      })
      cleanup = () => sub.subscription.unsubscribe()
      setTimeout(() => {
        if (active && !redeemed) setChecking(false)
      }, 3000)
    }

    void run()
    return () => {
      active = false
      cleanup()
    }
  }, [])

  const redeemLink = async () => {
    if (!pendingHash) return
    setRedeeming(true)
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: 'invite',
      token_hash: pendingHash,
    })
    // Strip the token from the URL so a refresh or back-button can't replay it.
    window.history.replaceState({}, document.title, window.location.pathname)
    setPendingHash(null)
    setReady(!verifyError)
    setRedeeming(false)
  }

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
      // The invite session is transient — sign out and send them to a normal
      // login with the new password, same reasoning as ResetPasswordPage.
      await supabase.auth.signOut()
      setDone(true)
      setTimeout(() => navigate('/auth/login', { replace: true }), 2500)
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not set your password. Try again.'))
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

        {done ? (
          <Alert type="success">
            Password set. Redirecting you to sign in…
          </Alert>
        ) : checking ? (
          <p className="text-center text-sm text-[var(--text-muted)]">Verifying your invite…</p>
        ) : pendingHash ? (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">Welcome to U-Sports</h2>
            <p className="text-[var(--text-muted)] text-sm">
              Press Continue to choose the password for your account.
            </p>
            <Button
              className="w-full"
              size="lg"
              loading={redeeming}
              icon={<KeyRound className="w-4 h-4" />}
              onClick={() => void redeemLink()}
            >
              Continue
            </Button>
          </div>
        ) : !ready ? (
          <Alert type="danger">
            This invite link is invalid or has expired. Ask whoever invited you to send a new
            one.
          </Alert>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1">Welcome to U-Sports</h2>
            <p className="text-[var(--text-muted)] text-sm mb-6">
              Set a password to finish setting up your account.
            </p>

            {error && (
              <Alert type="danger" className="mb-4">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  label="Password"
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
                label="Confirm password"
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
                Set password &amp; continue
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
