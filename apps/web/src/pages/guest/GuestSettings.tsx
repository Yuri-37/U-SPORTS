import AppearanceSection from '../../components/settings/AppearanceSection'

export default function GuestSettings() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Settings</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">Appearance only — sign in for account options.</p>
      <AppearanceSection />
    </div>
  )
}
