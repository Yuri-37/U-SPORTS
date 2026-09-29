import React from 'react'
import { Outlet } from 'react-router'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import AnnouncementBanner from '../announcements/AnnouncementBanner'

/**
 * Signed-in shell: the page holds one rounded frame; the sidebar sits
 * directly on the frame surface and the content is a white panel inset
 * inside it. `app-shell` switches the app's type (see styles/index.css).
 */
export default function AppLayout() {
  return (
    <div className="app-shell h-screen overflow-hidden bg-[var(--bg-primary)] lg:p-2.5">
      <div className="flex h-full bg-[var(--shell-frame)] lg:rounded-[22px] lg:border lg:border-[var(--border-subtle)] lg:shadow-[var(--shadow-frame)]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            <TopNav />
            <AnnouncementBanner />
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-screen-2xl px-6 py-8 lg:px-8">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
