import { create } from 'zustand'

/** Whether the signed-in navigation drawer is open (only used below the desktop breakpoint). */
interface NavDrawerState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useNavDrawer = create<NavDrawerState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
