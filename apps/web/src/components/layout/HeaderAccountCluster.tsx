import React, { useEffect, useRef, useState } from 'react'
import { Bell, LogOut, Settings, ChevronDown, UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { getInitials, formatDateTime } from '../../lib/utils'
import { Badge, Button, Modal, Alert } from '../ui'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import type { Notification } from '../../types'
import { supabase } from '../../lib/supabase'

function settingsPathForRole(role: string | undefined): string {
  if (role === 'Admin') return '/super-admin/preferences'
  if (role === 'Organizer' || role === 'Coach') return '/organizer/settings'
  if (role === 'Athlete') return '/athlete/settings'
  return '/guest'
}

function profilePathForRole(role: string | undefined): string | null {
  if (role === 'Athlete') return '/athlete/profile'
  return null
}

export type HeaderAccountClusterNavVariant = 'app' | 'guest'

type Props = {
  /**
   * `app` — sidebar already has Settings (and Profile for student/athlete); menu is sign-out only.
   * `guest` — guest hub shell has no sidebar; menu includes Profile + Settings + Sign out.
   */
  navVariant?: HeaderAccountClusterNavVariant
}

/** Notification bell + account menu (shared by App TopNav and guest shell for students). */
export default function HeaderAccountCluster({ navVariant = 'app' }: Props) {
  const { profile, session, signOut } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const avatarUrl = scopedProfile?.avatar_url ?? null
  const {
    unreadCount,
    notifications,
    fetchNotifications,
    addNotification,
    markRead,
    markAllRead,
    deleteNotification,
    clearAll,
  } = useNotificationStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  // Store *which* URL failed rather than a bare boolean: a freshly uploaded
  // photo has a new URL, so it no longer matches and retries on its own — no
  // reset effect needed.
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [detailNotif, setDetailNotif] = useState<Notification | null>(null)
  const [notifDeleteConfirm, setNotifDeleteConfirm] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)

  const bellWrapRef = useRef<HTMLDivElement>(null)

  const uid = scopedProfile?.id
  const isStaff =
    scopedProfile?.role === 'Organizer' ||
    scopedProfile?.role === 'Coach' ||
    scopedProfile?.role === 'Admin'
  // Every signed-in role now has a personal inbox — previously this popover
  // (and its realtime subscription below) was athlete-only, and the bell
  // routed staff to Announcements (the broadcast feature) instead of
  // anything personal.
  const usesNotificationPopover = scopedProfile?.role === 'Athlete' || isStaff

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth/login')
  }

  const notificationsRoute = isStaff ? '/organizer/notifications' : '/athlete/notifications'

  useEffect(() => {
    if (!uid || !usesNotificationPopover) return
    const ch = supabase
      .channel(`notifications-inbox:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id || typeof row.id !== 'string') return
          addNotification({
            id: row.id,
            recipient_id: String(row.recipient_id ?? ''),
            type: String(row.type ?? ''),
            title: String(row.title ?? ''),
            body: String(row.body ?? ''),
            data: (row.data as Record<string, unknown>) ?? {},
            read: Boolean(row.read),
            hidden: Boolean(row.hidden),
            created_at: String(row.created_at ?? ''),
          })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [uid, usesNotificationPopover, addNotification])

  useEffect(() => {
    if (!notifOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = bellWrapRef.current
      if (el && !el.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notifOpen])

  const openInboxPopover = () => {
    if (!uid) return
    void fetchNotifications(uid)
    setNotifOpen((v) => !v)
  }

  const previewBody = (body: string) => {
    const one = body.replace(/\s+/g, ' ').trim()
    return one.length > 72 ? `${one.slice(0, 72)}…` : one
  }

  if (!scopedProfile || !uid) return null

  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className="relative flex items-center gap-2 shrink-0"
          ref={usesNotificationPopover ? bellWrapRef : undefined}
        >
          <button
            type="button"
            onClick={openInboxPopover}
            className="relative p-2 rounded-lg hover:bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-expanded={usesNotificationPopover ? notifOpen : undefined}
            aria-haspopup={usesNotificationPopover ? 'dialog' : undefined}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-0.5 bg-[#FF3355] text-white text-[10px] font-bold rounded-full flex items-center justify-center tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {usesNotificationPopover && notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 max-h-[min(70vh,420px)] flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate">Notifications</span>
                  {unreadCount > 0 && (
                    <Badge variant="danger" size="sm">
                      {unreadCount} new
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {unreadCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2"
                      onClick={() => void markAllRead(uid)}
                    >
                      Read all
                    </Button>
                  )}
                  {notifications.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 text-[#FF3355]"
                      onClick={() => setClearAllOpen(true)}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                {notifications.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] text-center py-8 px-2">
                    No notifications yet.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setNotifDeleteConfirm(false)
                        setDetailNotif(n)
                        if (!n.read) void markRead(n.id)
                      }}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        !n.read
                          ? 'border-[#0066FF]/30 bg-[#0066FF]/5'
                          : 'border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-[#0066FF] mt-1 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{n.title}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                            {previewBody(n.body)}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {formatDateTime(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false)
                  navigate(notificationsRoute)
                }}
                className="w-full text-center text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] py-2 border-t border-[var(--border-subtle)] shrink-0 transition-colors"
              >
                View all
              </button>
            </div>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
          >
            {/* Uploaded photo when there is one, initials otherwise. `onError`
                falls back to initials if the stored URL 404s, so a deleted
                storage object can't leave an empty circle. */}
            {avatarUrl && failedAvatarUrl !== avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                onError={() => setFailedAvatarUrl(avatarUrl)}
                className="w-7 h-7 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-xs font-bold text-[var(--school-secondary)] shrink-0">
                {getInitials(scopedProfile.full_name)}
              </div>
            )}
            <span className="text-sm text-[var(--text-secondary)] hidden sm:block">
              {scopedProfile.full_name.split(' ')[0]}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl py-1 z-50">
              <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
                <p className="text-sm font-medium">{scopedProfile.full_name}</p>
                <p className="text-xs text-[var(--text-muted)] capitalize">
                  {scopedProfile.role.replace('_', ' ')}
                </p>
              </div>
              {navVariant === 'guest' && profilePathForRole(scopedProfile.role) ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate(profilePathForRole(scopedProfile.role)!)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  <UserCircle className="w-4 h-4" />
                  Profile
                </button>
              ) : null}
              {navVariant === 'guest' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate(settingsPathForRole(scopedProfile.role))
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3355] hover:bg-[#FF3355]/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!detailNotif}
        onClose={() => {
          setDetailNotif(null)
          setNotifDeleteConfirm(false)
        }}
        title={detailNotif?.title ?? 'Notification'}
        size="md"
      >
        {detailNotif && uid && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              {formatDateTime(detailNotif.created_at)}
            </p>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
              {detailNotif.body}
            </p>
            {notifDeleteConfirm ? (
              <>
                <Alert type="warning">
                  Delete this notification permanently? You cannot restore it from the inbox
                  afterward.
                </Alert>
                <div className="flex gap-2 justify-end pt-2 flex-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setNotifDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      void deleteNotification(detailNotif.id, uid).then(() => {
                        setDetailNotif(null)
                        setNotifDeleteConfirm(false)
                      })
                    }
                  >
                    Delete permanently
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-2 justify-end pt-2 flex-wrap">
                <Button variant="danger" size="sm" onClick={() => setNotifDeleteConfirm(true)}>
                  Delete
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDetailNotif(null)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        title="Clear all notifications"
        size="md"
      >
        {uid && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Remove every notification from your inbox? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => setClearAllOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  void clearAll(uid).then(() => {
                    setClearAllOpen(false)
                    setDetailNotif(null)
                    setNotifDeleteConfirm(false)
                  })
                }
              >
                Clear all
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
