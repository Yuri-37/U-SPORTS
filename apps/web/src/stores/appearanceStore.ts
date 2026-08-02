import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppearanceTheme = 'light' | 'dark'

const STORAGE_KEY = 'u-sports-appearance'

/** Apply theme attribute before React paints (call from main.tsx). */
export function hydrateAppearanceThemeFromStorage(): AppearanceTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      document.documentElement.dataset.theme = 'light'
      return 'light'
    }
    const parsed = JSON.parse(raw) as { state?: { theme?: string } }
    const t = parsed?.state?.theme === 'dark' ? 'dark' : 'light'
    document.documentElement.dataset.theme = t
    return t
  } catch {
    document.documentElement.dataset.theme = 'light'
    return 'light'
  }
}

function syncDocument(theme: AppearanceTheme) {
  document.documentElement.dataset.theme = theme
}

interface AppearanceState {
  theme: AppearanceTheme
  setTheme: (theme: AppearanceTheme) => void
  toggleDarkMode: () => void
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        syncDocument(theme)
        set({ theme })
      },
      toggleDarkMode: () => {
        const next: AppearanceTheme = get().theme === 'dark' ? 'light' : 'dark'
        syncDocument(next)
        set({ theme: next })
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        if (state?.theme) syncDocument(state.theme)
      },
    },
  ),
)
