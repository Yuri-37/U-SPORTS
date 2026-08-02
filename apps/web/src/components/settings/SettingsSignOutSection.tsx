import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { LogOut } from 'lucide-react'
import { Card, Button } from '../ui'
import { useAuthStore } from '../../stores/authStore'

/** Session card with sign out — include on each role’s Settings page */
export default function SettingsSignOutSection() {
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    try {
      await signOut()
      navigate('/auth/login', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1">Sign out</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        End your session on this browser. You will need to sign in again to use your dashboard.
      </p>
      <Button variant="danger" loading={loading} icon={<LogOut className="w-4 h-4" />} onClick={handleSignOut}>
        Sign out
      </Button>
    </Card>
  )
}
