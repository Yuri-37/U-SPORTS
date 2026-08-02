import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { Card } from '../ui'
import { useAppearanceStore } from '../../stores/appearanceStore'

export default function AppearanceSection() {
  const theme = useAppearanceStore((s) => s.theme)
  const toggleDarkMode = useAppearanceStore((s) => s.toggleDarkMode)

  const darkOn = theme === 'dark'

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1">Appearance</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Light mode is the default. Turn on dark mode for low-light environments — your choice syncs on this browser.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--surface-elevated)] border border-[var(--border-subtle)]"
            aria-hidden
          >
            {darkOn ? <Moon className="w-5 h-5 text-[var(--text-primary)]" /> : <Sun className="w-5 h-5 text-[var(--text-primary)]" />}
          </div>
          <div>
            <p className="font-medium text-sm">Dark mode</p>
            <p className="text-xs text-[var(--text-muted)]">{darkOn ? 'Dimmed colors site-wide' : 'Off — using light theme'}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={darkOn}
          onClick={() => toggleDarkMode()}
          className={`relative w-14 h-8 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] ${
            darkOn ? 'bg-[var(--accent-default)]' : 'bg-[var(--surface-elevated)] border border-[var(--border-subtle)]'
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              darkOn ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </Card>
  )
}
