import React, { useEffect, useState } from 'react'
import { Save, UserRound } from 'lucide-react'
import { Alert, Button, Card, Input, Select } from '../ui'
import api from '../../lib/api'
import { describeApiError } from '../../lib/apiError'
import { toast } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { yearLevelOptions } from '../../lib/validation/yearLevel'

/**
 * "Your profile" card for every role's Settings page: correct your own name,
 * and -- for athletes -- your year level. Only those two fields are sent; the
 * server rejects anything else (see PATCH /profile), so this can never be used
 * to change a role, email or department.
 */
export default function EditProfileSection() {
  const { profile, athlete, fetchProfile } = useAuthStore()
  const savedName = profile?.full_name ?? ''
  const savedYear = athlete?.year_level ?? ''

  const [name, setName] = useState(savedName)
  const [year, setYear] = useState(savedYear)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Follow the stored profile when it (re)loads or is refreshed after a save.
  useEffect(() => setName(savedName), [savedName])
  useEffect(() => setYear(savedYear), [savedYear])

  if (!profile) return null

  const nameChanged = name.trim() !== savedName
  const yearChanged = !!athlete && year !== savedYear
  const dirty = nameChanged || yearChanged

  // A stored value that isn't one of the current levels (older data) is kept
  // as a choice so the dropdown shows what is really on file.
  const baseOptions = athlete ? yearLevelOptions(athlete.department) : []
  const options =
    athlete && savedYear && !baseOptions.some((o) => o.value === savedYear)
      ? [...baseOptions, { value: savedYear, label: savedYear }]
      : baseOptions

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Full name is required')
      return
    }
    setSaving(true)
    try {
      await api.patch('/profile', {
        ...(nameChanged ? { full_name: name.trim() } : {}),
        ...(yearChanged ? { year_level: year } : {}),
      })
      await fetchProfile(profile.id)
      toast.success('Profile updated')
    } catch (err: unknown) {
      // The failed request already raised the red toast (lib/api.ts).
      setError(describeApiError(err, 'Could not update your profile'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
        <UserRound className="w-4 h-4 text-[var(--accent-default)]" aria-hidden />
        Your profile
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {athlete
          ? 'Fix a misspelled name, or update your year level when you move up.'
          : 'Fix a misspelled name. Your role and email are managed by the Super Admin.'}
      </p>
      {error && (
        <Alert type="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      <form onSubmit={save} className="space-y-4">
        <Input
          label="Full name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        {athlete && (
          <Select
            label="Year level"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            options={options}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            icon={<Save className="w-4 h-4" />}
            loading={saving}
            disabled={!dirty}
          >
            Save changes
          </Button>
          {dirty && !saving && (
            <button
              type="button"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              onClick={() => {
                setName(savedName)
                setYear(savedYear)
                setError('')
              }}
            >
              Discard
            </button>
          )}
        </div>
      </form>
    </Card>
  )
}
