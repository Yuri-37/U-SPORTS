import React from 'react'
import ChangePasswordSection from '../../components/settings/ChangePasswordSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'

export default function AthleteSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">
          Your athlete account. Profile and notifications are in the sidebar — dark mode is in the
          header.
        </p>
      </div>

      <ChangePasswordSection />

      <SettingsSignOutSection />
    </div>
  )
}
