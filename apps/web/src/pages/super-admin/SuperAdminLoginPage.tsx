import React, { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Shield, Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'
import { Button, Input, Alert } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useInstitutionStore } from '../../stores/institutionStore'
import { loginFormSchema } from '../../lib/validation/forms'
import { defaultPostLoginPath } from '../../lib/navigation'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { friendlyAuthError } from '../../lib/utils'

const STAFF_ROLES = new Set(['Admin', 'Organizer', 'Coach'])

export default function SuperAdminLoginPage() {
  const [searchParams] = useSearchParams()
  const deactivatedBanner = searchParams.get('reason') === 'deactivated'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { session, profile, fetchProfile } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { institution } = useInstitutionStore()
  const navigate = useNavigate()

  // Synchronous guard — App.tsx spinner ensures both stores are settled before render,
  // so this runs without any flash.
  if (session && scopedProfile && STAFF_ROLES.has(scopedProfile.role)) {
    return <Navigate to={scopedProfile.role === 'Admin' ? '/super-admin' : '/organizer'} replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const parsed = loginFormSchema.safeParse({ email: email.trim(), password })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid form')
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      })
      if (authError) throw new Error(authError.message)

      if (data.session) {
        await fetchProfile(data.session.user.id)
        const { profile: p } = useAuthStore.getState()

        if (!p?.role || !STAFF_ROLES.has(p.role)) {
          await supabase.auth.signOut()
          useAuthStore.setState({ session: null, user: null, profile: null })
          throw new Error('This portal is for staff only. Students use the main login.')
        }

        navigate(p.role === 'Admin' ? '/super-admin' : defaultPostLoginPath(p.role), {
          replace: true,
        })
      }
    } catch (err) {
      setError(friendlyAuthError(err, 'Invalid credentials'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6"
      style={{
        backgroundImage:
          'radial-gradient(circle at 25% 50%, rgba(0,102,255,0.07) 0%, transparent 55%), radial-gradient(circle at 75% 50%, rgba(0,102,255,0.04) 0%, transparent 55%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0066FF]/10 border border-[#0066FF]/20 mb-4 overflow-hidden">
            {institution?.logo_url ? (
              <img src={institution.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Shield className="w-8 h-8 text-[#0066FF]" />
            )}
          </div>
          <p className="text-[var(--accent-default)] font-bold text-xs uppercase tracking-[0.2em] mb-1.5">
            U-Sports
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Staff Portal</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {institution?.name ?? 'U-Sports'} · Super admins, organizers &amp; coaches
          </p>
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-8">
          {deactivatedBanner && (
            <Alert type="warning" className="mb-5">
              Your account was deactivated. Contact your super admin if you need access restored.
            </Alert>
          )}

          {error && (
            <Alert type="danger" className="mb-5">
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="staff@institution.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
              required
            />
            <div>
              <Input
                label="Password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                required
              />
              <div className="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPass ? 'Hide' : 'Show'} password
                </button>
                {/* Staff reset uses the same self-service flow as students —
                    see utils/accountEmail.ts. Previously staff had no link
                    here and had to ask an admin to mint a password by hand. */}
                <a
                  href="/auth/forgot-password"
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Forgot password?
                </a>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={submitting}
              icon={<LogIn className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Not staff?{' '}
          <a
            href="/auth/login"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
          >
            Student login →
          </a>
        </p>
      </div>
    </div>
  )
}
