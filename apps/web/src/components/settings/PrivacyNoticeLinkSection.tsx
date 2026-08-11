import React from 'react'
import { useNavigate } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { Card, Button } from '../ui'

/** Read-only link back to /privacy-notice — include on each role's Settings page. */
export default function PrivacyNoticeLinkSection() {
  const navigate = useNavigate()

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1">Privacy notice</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Review what U-Sports collects and how it's used — the same notice you agreed to when you
        first signed in.
      </p>
      <Button
        variant="secondary"
        icon={<ShieldCheck className="w-4 h-4" />}
        onClick={() => navigate('/privacy-notice')}
      >
        View privacy notice
      </Button>
    </Card>
  )
}
