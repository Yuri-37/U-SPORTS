import React, { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'

const SIZE_CLASSES: Record<'md' | 'lg', string> = {
  md: 'w-16 h-16 text-xl',
  lg: 'w-20 h-20 text-2xl',
}

function apiErrorMessage(e: unknown, fallback: string): string {
  const msg =
    e && typeof e === 'object' && 'response' in e
      ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
      : undefined
  return msg ?? fallback
}

/** Self-service avatar upload/removal — drop into any role's Profile/Settings page. */
export default function AvatarUpload({
  size = 'md',
  fallbackInitials,
}: {
  size?: 'md' | 'lg'
  fallbackInitials: string
}) {
  const { profile, setProfile } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')
    setBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ avatar_url: string }>('/profile/avatar', formData)
      if (profile) setProfile({ ...profile, avatar_url: data.avatar_url })
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Could not upload photo'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setError('')
    setBusy(true)
    try {
      await api.delete('/profile/avatar')
      if (profile) setProfile({ ...profile, avatar_url: null })
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Could not remove photo'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        className={`relative ${SIZE_CLASSES[size]} rounded-full overflow-hidden bg-[var(--school-primary)] flex items-center justify-center font-bold text-[var(--school-secondary)] shrink-0`}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          fallbackInitials
        )}
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Change photo"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <Camera className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          className="text-[#0066FF] hover:underline"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          Change photo
        </button>
        {profile?.avatar_url && (
          <>
            <span className="text-[var(--text-muted)]">·</span>
            <button
              type="button"
              className="text-[var(--danger)] hover:underline"
              onClick={() => void handleRemove()}
              disabled={busy}
            >
              Remove
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}
