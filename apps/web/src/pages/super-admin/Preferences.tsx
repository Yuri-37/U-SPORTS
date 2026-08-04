import React from 'react'
import { Keyboard, Shield } from 'lucide-react'
import { Card } from '../../components/ui'
import AppearanceSection from '../../components/settings/AppearanceSection'
import ChangePasswordSection from '../../components/settings/ChangePasswordSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'

export default function SuperAdminPreferences() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">
          Personal preferences and how U-Sports looks on your device.
        </p>
      </div>

      <AppearanceSection />

      <ChangePasswordSection />

      <Card className="p-6">
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--accent-default)]" aria-hidden />
          Account security
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          MFA is managed in Supabase Auth (Dashboard → Authentication). Contact your platform owner
          if you lose access.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-[var(--accent-default)]" aria-hidden />
          Keyboard shortcuts
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-2">
          From anywhere on the site, press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono">
            Ctrl
          </kbd>{' '}
          +{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono">
            Shift
          </kbd>{' '}
          +{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono">
            A
          </kbd>{' '}
          to open the Super Admin portal when signed in as a super admin.
        </p>
      </Card>

      <SettingsSignOutSection />
    </div>
  )
}
