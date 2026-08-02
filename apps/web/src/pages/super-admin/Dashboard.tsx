import React, { useEffect, useState } from 'react'
import { Users, Trophy, Shield, ClipboardCheck, TrendingUp, Globe } from 'lucide-react'
import { StatCard, Card, Skeleton, Badge } from '../../components/ui'
import { useInstitutionStore } from '../../stores/institutionStore'
import api from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import type { AuditLog } from '../../types'

interface PlatformStats {
  totalAthletes: number
  activeEvents: number
  currentSeason: { name: string; status: string } | null
}

export default function SuperAdminDashboard() {
  const { institution } = useInstitutionStore()
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats').then((r) => r.data),
      api.get('/admin/audit?limit=5').then((r) => r.data.data),
    ])
      .then(([s, logs]) => { setStats(s); setRecentLogs(logs) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          {institution?.name} — Full platform overview
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard label="Active Athletes" value={stats?.totalAthletes ?? 0} subValue="Active" />
            <StatCard label="Live Events" value={stats?.activeEvents ?? 0} subValue="In Progress" />
            <StatCard
              label="Current Season"
              value={stats?.currentSeason?.name ?? 'None'}
              subValue={stats?.currentSeason?.status ?? ''}
            />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick actions */}
        <Card>
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0066FF]" />
            Admin Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Guest hub (public)', href: '/guest', icon: Globe },
              { label: 'Manage Organizers', href: '/super-admin/organizers', icon: Users },
              { label: 'Season Settings', href: '/super-admin/seasons', icon: Trophy },
              { label: 'Student roster', href: '/organizer/athletes', icon: ClipboardCheck },
              { label: 'Analytics', href: '/organizer/analytics', icon: TrendingUp },
            ].map((a) => {
              const Icon = a.icon
              return (
                <a
                  key={a.label}
                  href={a.href}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[#0066FF]/50 hover:bg-[#0066FF]/5 transition-all text-center"
                >
                  <Icon className="w-6 h-6 text-[#0066FF]" />
                  <span className="text-xs font-medium">{a.label}</span>
                </a>
              )
            })}
          </div>
        </Card>

        {/* Recent audit logs */}
        <Card>
          <h2 className="font-bold text-lg mb-4">Recent Activity</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : recentLogs.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(log.actor as any)?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{log.action.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatDateTime(log.created_at)}</p>
                  </div>
                  <Badge size="sm">{log.entity_type}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
