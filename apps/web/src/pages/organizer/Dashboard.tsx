import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Trophy, UserCheck, Play, Mic2, Dumbbell, BarChart3, Users, Calendar } from 'lucide-react'
import { StatCard, Card, Badge, Button, Skeleton } from '../../components/ui'
import { CreateEventModal } from '../../components/organizer/CreateEventModal'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import {
  formatEnumLabel,
  getSportIcon,
  getSportLabel,
  organizerEventStatusLabel,
  formatDateTime,
} from '../../lib/utils'
import { fetchParticipantLabels } from '../../lib/participantLabels'
import type { Event, Match } from '../../types'

export default function OrganizerDashboard() {
  const { organizer, profile, session } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const isCoach = scopedProfile?.role === 'Coach'
  const navigate = useNavigate()

  // Shared
  const [loading, setLoading] = useState(true)

  // Organizer-only
  const [events, setEvents] = useState<Event[]>([])
  const [liveMatches, setLiveMatches] = useState<Match[]>([])
  const [liveMatchLabels, setLiveMatchLabels] = useState<Record<string, string>>({})
  const [showCreateEvent, setShowCreateEvent] = useState(false)

  // Coach-only
  const [coachTeams, setCoachTeams] = useState<any[]>([])
  const [coachLiveMatches, setCoachLiveMatches] = useState<Match[]>([])
  const [coachUpcoming, setCoachUpcoming] = useState<Match[]>([])
  const [coachMatchLabels, setCoachMatchLabels] = useState<Record<string, string>>({})
  const [coachAthleteCount, setCoachAthleteCount] = useState(0)

  useEffect(() => {
    if (isCoach) {
      // Load coach's teams via team_coaches
      supabase
        .from('team_coaches')
        .select('team:teams(id, name, sport, department, season:seasons(name, status))')
        .eq('organizer_id', organizer?.id ?? '')
        .then(async ({ data }) => {
          const teams = (data ?? []).map((r: any) => r.team).filter(Boolean)
          setCoachTeams(teams)

          if (teams.length === 0) {
            setLoading(false)
            return
          }
          const teamIds = teams.map((t: any) => t.id)

          // Athletes across all coach teams
          const { count } = await supabase
            .from('team_members')
            .select('id', { count: 'exact', head: true })
            .in('team_id', teamIds)
          setCoachAthleteCount(count ?? 0)

          // Live + upcoming matches for these teams
          const [liveRes, upcomingRes] = await Promise.all([
            supabase
              .from('matches')
              .select('*')
              .eq('status', 'live')
              .or(
                teamIds
                  .map((id: string) => `participant_a_id.eq.${id},participant_b_id.eq.${id}`)
                  .join(','),
              ),
            supabase
              .from('matches')
              .select('*, event:events(name, sport)')
              .eq('status', 'scheduled')
              .or(
                teamIds
                  .map((id: string) => `participant_a_id.eq.${id},participant_b_id.eq.${id}`)
                  .join(','),
              )
              .order('scheduled_at', { ascending: true })
              .limit(5),
          ])
          setCoachLiveMatches(liveRes.data ?? [])
          setCoachUpcoming(upcomingRes.data ?? [])

          // Resolve participant labels
          const allIds = [
            ...new Set(
              [
                ...(liveRes.data ?? []).flatMap((m: Match) => [
                  m.participant_a_id,
                  m.participant_b_id,
                ]),
                ...(upcomingRes.data ?? []).flatMap((m: Match) => [
                  m.participant_a_id,
                  m.participant_b_id,
                ]),
              ].filter((x): x is string => !!x),
            ),
          ]
          if (allIds.length > 0) {
            const labels = await fetchParticipantLabels(allIds)
            setCoachMatchLabels(labels)
          }
          setLoading(false)
        })
      return
    }
    Promise.all([
      supabase
        .from('events')
        .select('*')
        .in('status', ['in_progress', 'draft', 'registration'])
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('matches').select('*').eq('status', 'live'),
    ]).then(([evRes, mRes]) => {
      setEvents(evRes.data ?? [])
      setLiveMatches(mRes.data ?? [])
      setLoading(false)
    })
  }, [isCoach, organizer?.id])

  useEffect(() => {
    if (isCoach) return
    const ids = [
      ...new Set(
        liveMatches.flatMap((m) =>
          [m.participant_a_id, m.participant_b_id].filter((x): x is string => !!x),
        ),
      ),
    ]
    if (ids.length === 0) {
      setLiveMatchLabels({})
      return
    }
    let cancelled = false
    void fetchParticipantLabels(ids).then((map) => {
      if (!cancelled) setLiveMatchLabels(map)
    })
    return () => {
      cancelled = true
    }
  }, [liveMatches, isCoach])

  if (isCoach) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Coach Dashboard</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {scopedProfile?.department ?? '—'}
            {(organizer?.assigned_sports ?? []).length > 0 && (
              <>
                {' '}
                ·{' '}
                {(organizer!.assigned_sports as string[])
                  .map((s) => getSportLabel(s as any))
                  .join(', ')}
              </>
            )}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-tour="coach-stats">
          <StatCard
            label="Teams"
            value={loading ? '—' : coachTeams.length}
            subValue="Assigned to you"
          />
          <StatCard
            label="Athletes"
            value={loading ? '—' : coachAthleteCount}
            subValue="Across your teams"
          />
          <StatCard
            label="Live now"
            value={loading ? '—' : coachLiveMatches.length}
            subValue="Matches in progress"
          />
          <StatCard
            label="Sports"
            value={organizer?.assigned_sports?.length ?? 0}
            subValue="Assigned"
          />
        </div>

        {/* Live matches */}
        {coachLiveMatches.length > 0 && (
          <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse" />
              <span className="font-bold text-[var(--danger)] text-sm">LIVE NOW</span>
            </div>
            <div className="space-y-2">
              {coachLiveMatches.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {coachMatchLabels[m.participant_a_id ?? ''] ?? '—'} vs{' '}
                    {coachMatchLabels[m.participant_b_id ?? ''] ?? '—'}
                  </span>
                  <Badge variant="danger" size="sm">
                    Live
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My teams */}
        <div data-tour="coach-teams">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-[var(--accent-default)]" />
            My teams
          </h2>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : coachTeams.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No teams assigned yet. An organizer will add you to a team.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {coachTeams.map((t: any) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/organizer/teams?teamId=${t.id}`)}
                  className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)]"
                >
                  <Card className="hover:border-[var(--accent-default)]/40 transition-colors h-full">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{getSportIcon(t.sport)}</span>
                      <p className="font-semibold truncate">{t.name}</p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {getSportLabel(t.sport)}
                      {t.department ? ` · ${t.department}` : ''}
                    </p>
                    {t.season && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.season.name}</p>
                    )}
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming matches */}
        {coachUpcoming.length > 0 && (
          <div>
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-default)]" />
              Upcoming matches
            </h2>
            <div className="space-y-2">
              {coachUpcoming.map((m) => (
                <Card key={m.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {coachMatchLabels[m.participant_a_id ?? ''] ?? '—'} vs{' '}
                      {coachMatchLabels[m.participant_b_id ?? ''] ?? '—'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {(m as any).event?.name ?? 'Event'} ·{' '}
                      {m.scheduled_at ? formatDateTime(m.scheduled_at) : 'Date TBD'}
                    </p>
                  </div>
                  <Badge variant="default" size="sm">
                    Scheduled
                  </Badge>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div data-tour="coach-quick-actions">
          <h2 className="font-semibold mb-3">Quick actions</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              {
                icon: Dumbbell,
                label: 'Teams',
                sub: 'Manage rosters and lineups',
                to: '/organizer/teams',
              },
              {
                icon: UserCheck,
                label: 'Athletes',
                sub: "View your sport's athletes",
                to: '/organizer/athletes',
              },
              {
                icon: BarChart3,
                label: 'Analytics',
                sub: 'Season stats and insights',
                to: '/organizer/analytics',
              },
            ].map(({ icon: Icon, label, sub, to }) => (
              <button
                key={to}
                type="button"
                onClick={() => navigate(to)}
                className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent-default)]/50 hover:bg-[var(--accent-default)]/5 transition-all text-left"
              >
                <Icon className="w-6 h-6 text-[var(--accent-default)] shrink-0" />
                <div>
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organizer Dashboard</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Managing:{' '}
          {(organizer?.assigned_sports ?? []).map((s) => getSportLabel(s as any)).join(', ') ||
            'All sports'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4" data-tour="org-stats">
        <StatCard label="My Events" value={events.length} subValue="Active + Draft" />
        <StatCard label="Live Now" value={liveMatches.length} subValue="Matches in progress" />
        <StatCard
          label="Sports"
          value={organizer?.assigned_sports?.length ?? 0}
          subValue="Assigned"
        />
      </div>

      {liveMatches.length > 0 && (
        <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-xl p-4" data-tour="org-live-panel">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse-live" />
            <span className="font-bold text-[var(--danger)] text-sm">LIVE MATCHES</span>
          </div>
          <div className="space-y-2">
            {liveMatches.map((m) => {
              const la = m.participant_a_id
                ? (liveMatchLabels[m.participant_a_id] ?? `Team ${m.participant_a_id.slice(0, 6)}`)
                : 'TBD'
              const lb = m.participant_b_id
                ? (liveMatchLabels[m.participant_b_id] ?? `Team ${m.participant_b_id.slice(0, 6)}`)
                : 'TBD'
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm min-w-0">
                    {la} <span className="text-[var(--text-muted)] font-normal">vs</span> {lb}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => navigate(`/organizer/scoring/${m.id}`)}>
                      Score Now
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}
                    >
                      Jumbotron
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Recent Events</h2>
            <Button size="sm" variant="ghost" onClick={() => navigate('/organizer/events')}>
              View all →
            </Button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm">No events yet</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0 cursor-pointer hover:bg-[var(--surface-elevated)] -mx-2 px-2 rounded-lg"
                  onClick={() => navigate(`/organizer/events/${e.id}`)}
                >
                  <span className="text-lg">{getSportIcon(e.sport as any)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatEnumLabel(e.format)}</p>
                  </div>
                  <Badge
                    variant={
                      e.status === 'in_progress'
                        ? 'danger'
                        : e.status === 'completed'
                          ? 'success'
                          : 'default'
                    }
                    size="sm"
                  >
                    {organizerEventStatusLabel(e.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card data-tour="org-quick-actions">
          <h2 className="font-bold text-lg mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'New Event', icon: Trophy, action: () => setShowCreateEvent(true) },
              { label: 'Athletes', icon: UserCheck, action: () => navigate('/organizer/athletes') },
              {
                label: 'Announcements',
                icon: Mic2,
                action: () => navigate('/organizer/announcements'),
              },
              { label: 'Live Score', icon: Play, action: () => navigate('/organizer/events') },
            ].map((a) => {
              const Icon = a.icon
              return (
                <button
                  key={a.label}
                  onClick={a.action}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent-default)]/50 hover:bg-[var(--accent-default)]/5 transition-all"
                >
                  <Icon className="w-6 h-6 text-[var(--accent-default)]" />
                  <span className="text-xs font-medium">{a.label}</span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      <CreateEventModal open={showCreateEvent} onClose={() => setShowCreateEvent(false)} />
    </div>
  )
}
