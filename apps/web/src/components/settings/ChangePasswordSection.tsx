import React, { useState } from 'react'
import { KeyRound, Lock, Eye, EyeOff } from 'lucide-react'
import { Card, Input, Button, Alert, PasswordStrengthMeter } from '../ui'
import api from '../../lib/api'
import { passwordZ } from '../../lib/validation/forms'

/** Change-password card with 7-day cooldown enforced server-side — include on each role's Settings page. */
export default function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!currentPassword) {
      setError('Enter your current password')
      return
    }
    const parsed = passwordZ.safeParse(newPassword)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid password')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      setSuccess('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Could not change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-[var(--accent-default)]" aria-hidden />
        Change password
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        You can change your password once every 7 days.
      </p>

      {error && (
        <Alert type="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert type="success" className="mb-4" onDismiss={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Current password"
          type={showPasswords ? 'text' : 'password'}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          autoComplete="current-password"
          required
        />
        <div>
          <Input
            label="New password"
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            autoComplete="new-password"
            required
          />
          <PasswordStrengthMeter password={newPassword} />
        </div>
        <Input
          label="Confirm new password"
          type={showPasswords ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
          required
        />
        <button
          type="button"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
          onClick={() => setShowPasswords((v) => !v)}
        >
          {showPasswords ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showPasswords ? 'Hide' : 'Show'} passwords
        </button>
        <Button type="submit" loading={loading} icon={<KeyRound className="w-4 h-4" />}>
          Update password
        </Button>
      </form>
    </Card>
  )
}
