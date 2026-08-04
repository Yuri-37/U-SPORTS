import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useAppearanceStore } from '../../stores/appearanceStore'

/** Compact header icon button — the CSS transition on theme tokens (see styles/index.css) is what makes the switch smooth. */
export default function DarkModeToggle() {
  const theme = useAppearanceStore((s) => s.theme)
  const toggleDarkMode = useAppearanceStore((s) => s.toggleDarkMode)
  const darkOn = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={darkOn}
      aria-label={darkOn ? 'Switch to light mode' : 'Switch to dark mode'}
      title={darkOn ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => toggleDarkMode()}
      className="inline-flex items-center justify-center rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
    >
      {darkOn ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}
