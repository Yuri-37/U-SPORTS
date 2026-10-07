import React from 'react'
import { Card, Badge } from '../../components/ui'
import PageHeader from '../../components/layout/PageHeader'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, getInitials } from '../../lib/utils'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import ChangePasswordSection from '../../components/settings/ChangePasswordSection'
import EditProfileSection from '../../components/settings/EditProfileSection'
import PrivacyNoticeLinkSection from '../../components/settings/PrivacyNoticeLinkSection'
import YourDataSection from '../../components/settings/YourDataSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'
import AvatarUpload from '../../components/settings/AvatarUpload'
import StaffManualLinkSection from '../../components/settings/StaffManualLinkSection'

export default function OrganizerSettings() {
  const { profile, organizer, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader title="Settings" subtitle="Your organizer account details" />

      <Card>
        <div className="mb-6">
          <AvatarUpload size="md" fallbackInitials={getInitials(scopedProfile?.full_name ?? 'O')}>
            <h2 className="font-bold text-lg">{scopedProfile?.full_name}</h2>
            <p className="text-sm text-[var(--text-muted)]">{scopedProfile?.email}</p>
            <Badge variant="info" size="sm" className="mt-1">
              {scopedProfile?.role === 'Admin'
                ? 'Super Admin'
                : (scopedProfile?.role ?? 'Organizer')}
            </Badge>
          </AvatarUpload>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase mb-2">
              Assigned Sports
            </p>
            <div className="flex gap-2 flex-wrap">
              {(organizer?.assigned_sports ?? []).map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-sm"
                >
                  <span>{getSportIcon(s as any)}</span>
                  <span>{getSportLabel(s as any)}</span>
                </div>
              ))}
              {(organizer?.assigned_sports ?? []).length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">No sports assigned</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase mb-2">
              Account Status
            </p>
            <Badge variant={organizer?.is_active ? 'success' : 'danger'}>
              {organizer?.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </Card>

      <EditProfileSection />

      <ChangePasswordSection />

      <StaffManualLinkSection />

      <PrivacyNoticeLinkSection />

      <YourDataSection canDelete={false} />

      <SettingsSignOutSection />
    </div>
  )
}
