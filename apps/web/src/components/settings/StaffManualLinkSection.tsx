import React from 'react'
import { useNavigate } from 'react-router'
import { HelpCircle } from 'lucide-react'
import { Card, Button } from '../ui'

/** Link to /help — include on every staff role's Settings page. */
export default function StaffManualLinkSection() {
  const navigate = useNavigate()

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1">Help Center</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Replay your guided tour any time, or check the quick reference for your role.
      </p>
      <Button
        variant="secondary"
        icon={<HelpCircle className="w-4 h-4" />}
        onClick={() => navigate('/help')}
      >
        Open Help Center
      </Button>
    </Card>
  )
}
