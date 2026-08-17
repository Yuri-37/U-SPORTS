import React from 'react'
import { Keyboard, Shield } from 'lucide-react'
import { Card } from '../../components/ui'
import ChangePasswordSection from '../../components/settings/ChangePasswordSection'
import PrivacyNoticeLinkSection from '../../components/settings/PrivacyNoticeLinkSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'
import AvatarUpload from '../../components/settings/AvatarUpload'
import StaffManualLinkSection from '../../components/settings/StaffManualLinkSection'
import { useAuthStore } from '../../stores/authStore'
import { getInitials } from '../../lib/utils'

export default function SuperAdminPreferences() {
  const { profile } = useAuthStore()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">
          Personal preferences — dark mode is in the header.
        </p>
      </div>

      <Card className="p-6">
        <AvatarUpload size="md" fallbackInitials={getInitials(profile?.full_name ?? 'A')}>
          <p className="font-bold">{profile?.full_name}</p>
          <p className="text-sm text-[var(--text-muted)]">{profile?.email}</p>
        </AvatarUpload>
      </Card>

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

      <StaffManualLinkSection />

      <PrivacyNoticeLinkSection />

      <SettingsSignOutSection />
    </div>
  )
}
