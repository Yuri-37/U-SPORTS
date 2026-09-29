import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useInstitutionStore } from '../../stores/institutionStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { cn } from '../../lib/utils'
import HeaderAccountCluster from './HeaderAccountCluster'
import {
  groupNav,
  navForRole,
  sectionForPath,
  sidebarIconClass,
  sidebarRowClass,
  type NavItem,
} from './navConfig'

function NavRow({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={Boolean(item.exact)}
      data-tour={`nav-${item.to}`}
      className={sidebarRowClass(active, collapsed)}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={sidebarIconClass(active)} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}

function Divider() {
  return <div className="mx-1 my-3 h-px bg-[var(--border-subtle)]" />
}

export default function Sidebar() {
  const { profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { institution } = useInstitutionStore()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const role = scopedProfile?.role
  const { primary, secondary, help } = groupNav(navForRole(role))
  const activeTo = sectionForPath(location.pathname, role)?.to
  const row = (item: NavItem) => (
    <NavRow key={item.to} item={item} active={item.to === activeTo} collapsed={collapsed} />
  )

  return (
    <aside
      className={cn(
        'relative z-40 flex h-full shrink-0 flex-col transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[220px]',
      )}
    >
      {/* Brand */}
      <div
        className={cn('flex items-center gap-2.5 pb-4 pt-5', collapsed ? 'flex-col px-2' : 'px-5')}
      >
        {institution?.logo_url ? (
          <img
            src={institution.logo_url}
            alt="Logo"
            className="h-8 w-auto max-w-[5rem] shrink-0 object-contain"
          />
        ) : (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--school-primary)] text-xs font-bold text-[var(--school-secondary)]">
            {institution?.abbreviation?.slice(0, 2) ?? 'US'}
          </div>
        )}
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            U-Sports
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] shadow-[var(--shadow-raised)] transition-colors hover:text-[var(--text-primary)]"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="space-y-0.5">{primary.map(row)}</div>
        {secondary.length > 0 && (
          <>
            <Divider />
            <div className="space-y-0.5">{secondary.map(row)}</div>
          </>
        )}
      </nav>

      {/* Bottom: help, notifications, account */}
      <div className="space-y-0.5 px-3 pb-4 pt-2">
        {help && row(help)}
        <HeaderAccountCluster placement="sidebar" collapsed={collapsed} activeTo={activeTo} />
      </div>
    </aside>
  )
}
