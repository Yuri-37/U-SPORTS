import React from 'react'
import { Outlet } from 'react-router'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import AnnouncementBanner from '../announcements/AnnouncementBanner'

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav />
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-screen-2xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
