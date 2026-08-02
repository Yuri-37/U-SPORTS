import React from 'react'
import AppearanceSection from '../../components/settings/AppearanceSection'
import ChangePasswordSection from '../../components/settings/ChangePasswordSection'
import SettingsSignOutSection from '../../components/settings/SettingsSignOutSection'

export default function AthleteSettings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">Appearance for your athlete account. Profile and notifications are in the sidebar.</p>
      </div>

      <AppearanceSection />

      <ChangePasswordSection />

      <SettingsSignOutSection />
    </div>
  )
}
