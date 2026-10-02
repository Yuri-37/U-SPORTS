import React from 'react'
import { Outlet } from 'react-router'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import AnnouncementBanner from '../announcements/AnnouncementBanner'
import ToastHost from '../ui/ToastHost'

/**
 * Signed-in shell: the page holds one rounded frame; the sidebar sits
 * directly on the frame surface and the content is a white panel inset
 * inside it. `app-shell` switches the app's type (see styles/index.css).
 */
export default function AppLayout() {
  return (
    <div className="app-shell h-dvh overflow-hidden bg-[var(--bg-primary)] lg:p-2.5">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-[var(--surface-card)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to content
      </a>
      <div className="flex h-full bg-[var(--shell-frame)] lg:rounded-[22px] lg:border lg:border-[var(--border-subtle)] lg:shadow-[var(--shadow-frame)]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)] lg:rounded-2xl lg:border lg:border-[var(--border-subtle)]">
            <TopNav />
            <AnnouncementBanner />
            <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
              <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
      <ToastHost />
    </div>
  )
}
