import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastState {
  items: ToastItem[]
  push: (kind: ToastKind, text: string) => void
  dismiss: (id: number) => void
}

let nextId = 1
const LIFETIME_MS: Record<ToastKind, number> = { success: 4000, info: 4000, error: 7000 }

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (kind, text) => {
    const id = nextId++
    // Keep the stack short; a flood of identical confirmations is noise.
    set((s) => ({ items: [...s.items.filter((t) => t.text !== text), { id, kind, text }].slice(-3) }))
    setTimeout(() => get().dismiss(id), LIFETIME_MS[kind])
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}))

/**
 * Fire-and-forget feedback for actions that otherwise finish silently:
 *   toast.success('Team deleted')
 * Usable from any handler, inside or outside React.
 */
export const toast = {
  success: (text: string) => useToastStore.getState().push('success', text),
  error: (text: string) => useToastStore.getState().push('error', text),
  info: (text: string) => useToastStore.getState().push('info', text),
}
