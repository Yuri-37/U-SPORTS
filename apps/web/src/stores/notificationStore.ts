import { create } from 'zustand'
import type { Notification } from '../types'
import { supabase } from '../lib/supabase'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  fetchNotifications: (userId: string) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: (userId: string) => Promise<void>
  deleteNotification: (id: string, userId: string) => Promise<void>
  clearAll: (userId: string) => Promise<void>
  addNotification: (notification: Notification) => void
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async (userId) => {
    const [listRes, countRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('read', false),
    ])

    const notifications = listRes.data ?? []
    const unreadCount =
      typeof countRes.count === 'number'
        ? countRes.count
        : notifications.filter((n) => !n.read).length
    set({
      notifications,
      unreadCount,
    })
  },

  markRead: async (id) => {
    const recipientId = get().notifications.find((n) => n.id === id)?.recipient_id
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (recipientId) {
      await get().fetchNotifications(recipientId)
    } else {
      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }))
    }
  },

  markAllRead: async (userId) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', userId)
      .eq('read', false)
    await get().fetchNotifications(userId)
  },

  deleteNotification: async (id, userId) => {
    await supabase.from('notifications').delete().eq('id', id).eq('recipient_id', userId)
    await get().fetchNotifications(userId)
  },

  clearAll: async (userId) => {
    await supabase.from('notifications').delete().eq('recipient_id', userId)
    await get().fetchNotifications(userId)
  },

  addNotification: (notification) => {
    set((state) => {
      if (state.notifications.some((n) => n.id === notification.id)) return state
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + (notification.read ? 0 : 1),
      }
    })
  },
}))
