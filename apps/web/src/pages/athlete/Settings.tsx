import React from 'react'
import ChangePasswordSection from '../../components/settings/ChangePasswordSection'
import EditProfileSection from '../../components/settings/EditProfileSection'
import PrivacyNoticeLinkSection from '../../components/settings/PrivacyNoticeLinkSection'
import YourDataSection from '../../components/settings/YourDataSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'
import PageHeader from '../../components/layout/PageHeader'

export default function AthleteSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Your athlete account. Profile and notifications are in the sidebar — dark mode is in the header."
      />

      <EditProfileSection />

      <ChangePasswordSection />

      <PrivacyNoticeLinkSection />

      <YourDataSection canDelete />

      <SettingsSignOutSection />
    </div>
  )
}
