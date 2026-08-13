import React, { useEffect, useState } from 'react'
import { Card, Badge, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import type { Season } from '../../types'
import { formatDate, formatEnumLabel, getSportLabel } from '../../lib/utils'

const STATUS_BADGE: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  active: 'success',
  completed: 'info',
  archived: 'default',
}

/** Read-only mirror of Super Admin's Seasons page, scoped to the seasons this
 *  Organizer/Coach is assigned to. Organizers previously had no visibility
 *  into Seasons at all, despite every one of their Event/Team forms
 *  requiring one. */
export default function OrganizerSeasons() {
  const { organizer } = useAuthStore()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Season[]>('/admin/seasons')
      .then(({ data }) => setSeasons(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const mySeasons = organizer
    ? seasons.filter((s) => (s.staff ?? []).some((st) => st.organizer_id === organizer.id))
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seasons</h1>
        <p className="text-[var(--text-muted)] text-sm">
          Seasons you're assigned to. Ask a Super Admin to add or change your season assignments.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : mySeasons.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[var(--text-muted)]">
            You aren't assigned to any season yet. Ask a Super Admin to add you under Seasons.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {mySeasons.map((s) => (
            <Card key={s.id} className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatDate(s.start_date)} — {formatDate(s.end_date)}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(s.sports ?? []).map((sport) => (
                    <Badge key={sport} size="sm" variant="default">
                      {getSportLabel(sport as any)}
                    </Badge>
                  ))}
                </div>
              </div>
              <Badge variant={STATUS_BADGE[s.status]}>{formatEnumLabel(s.status)}</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
