import React, { useEffect, useMemo, useState } from 'react'
import { Bell, Check, Trash2, X } from 'lucide-react'
import { Button, Card, EmptyState, Alert, Modal } from '../../components/ui'
import { useNotificationStore } from '../../stores/notificationStore'
import { useAuthStore } from '../../stores/authStore'
import { formatDateTime } from '../../lib/utils'

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
type Filter = 'all' | 'unread' | 'recent'

/** Generic notification inbox — reused by both the athlete route
 *  (/athlete/notifications) and the staff route (/organizer/notifications).
 *  Nothing here is role-specific: it reads whichever profile is signed in. */
export default function NotificationsPage() {
  const { profile } = useAuthStore()
  const { notifications, fetchNotifications, markRead, markAllRead, deleteNotification, clearAll } =
    useNotificationStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (profile) fetchNotifications(profile.id)
  }, [profile])

  const unread = notifications.filter((n) => !n.read)

  const visible = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read)
    if (filter === 'recent') {
      const cutoff = Date.now() - RECENT_WINDOW_MS
      return notifications.filter((n) => new Date(n.created_at).getTime() >= cutoff)
    }
    return notifications
  }, [notifications, filter])

  const handleClearAll = async () => {
    if (!profile) return
    setClearing(true)
    try {
      await clearAll(profile.id)
      setConfirmClearAll(false)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-[var(--text-muted)] text-sm">{unread.length} unread</p>
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Check className="w-3.5 h-3.5" />}
              onClick={() => profile && markAllRead(profile.id)}
            >
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setConfirmClearAll(true)}
            >
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {(
          [
            ['all', 'All'],
            ['unread', 'Unread'],
            ['recent', 'Recent'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === id
                ? 'bg-[#0066FF] border-transparent text-white'
                : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-10 h-10" />}
          title="No notifications"
          description="You're all caught up!"
        />
      ) : visible.length === 0 ? (
        <p className="text-center text-[var(--text-muted)] py-10">
          No notifications match this filter.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <Card
              key={n.id}
              className={`flex items-start gap-3 ${!n.read ? 'border-[#0066FF]/30 bg-[#0066FF]/5' : ''}`}
            >
              {!n.read && (
                <div className="w-2 h-2 rounded-full bg-[#0066FF] mt-1.5 flex-shrink-0" />
              )}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => !n.read && markRead(n.id)}
              >
                <p className="font-semibold text-sm">{n.title}</p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">{n.body}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {formatDateTime(n.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => profile && deleteNotification(n.id, profile.id)}
                className="text-[var(--text-muted)] hover:text-[#FF3355] transition-colors flex-shrink-0 p-1"
                aria-label="Clear notification"
              >
                <X className="w-4 h-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={confirmClearAll}
        onClose={() => {
          if (!clearing) setConfirmClearAll(false)
        }}
        title="Clear all notifications?"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="warning">
            This removes all {notifications.length} notifications from your inbox. You cannot undo
            this.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmClearAll(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button variant="danger" loading={clearing} onClick={handleClearAll}>
              Clear all
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
