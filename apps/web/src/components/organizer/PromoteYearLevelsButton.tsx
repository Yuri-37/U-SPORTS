import React, { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { Alert, Button, Modal, Skeleton } from '../ui'
import api from '../../lib/api'
import { describeApiError } from '../../lib/apiError'
import { toast } from '../../stores/toastStore'

type Preview = {
  promoted: number
  atLastLevel: number
  notSet: number
  summary: Record<string, number>
  lastPromotedAt: string | null
}

const RECENT_DAYS = 180

/**
 * Super Admin: move every active athlete up one year level (the start-of-year
 * rollover). Always previews first -- exact counts, nothing changed -- and
 * warns when this was already run recently, because pressing it twice is the
 * one realistic mistake.
 */
export default function PromoteYearLevelsButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [confirmAgain, setConfirmAgain] = useState(false)

  const openDialog = async () => {
    setOpen(true)
    setPreview(null)
    setError('')
    setConfirmAgain(false)
    setLoading(true)
    try {
      const { data } = await api.post<Preview>('/athletes/promote-year-levels', { dry_run: true })
      setPreview(data)
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not check the year levels'))
    } finally {
      setLoading(false)
    }
  }

  const run = async () => {
    setRunning(true)
    setError('')
    try {
      const { data } = await api.post<Preview>('/athletes/promote-year-levels', { dry_run: false })
      toast.success(`Moved ${data.promoted} athlete${data.promoted === 1 ? '' : 's'} up a year level`)
      setOpen(false)
      onDone()
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not promote the year levels'))
    } finally {
      setRunning(false)
    }
  }

  const last = preview?.lastPromotedAt ? new Date(preview.lastPromotedAt) : null
  const recent = !!last && Date.now() - last.getTime() < RECENT_DAYS * 24 * 60 * 60 * 1000
  const canRun = !!preview && preview.promoted > 0 && (!recent || confirmAgain)

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<GraduationCap className="w-4 h-4" />}
        onClick={() => void openDialog()}
      >
        Promote year levels
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!running) setOpen(false)
        }}
        title="Promote year levels"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Moves every <strong>active</strong> athlete up one level for the new academic year
            (1st → 2nd → 3rd → 4th, Grade 11 → Grade 12).
          </p>

          {error && <Alert type="danger">{error}</Alert>}

          {loading && <Skeleton className="h-28 w-full" />}

          {preview && (
            <>
              {recent && last && (
                <Alert type="warning">
                  Year levels were already promoted on{' '}
                  {last.toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                  . Running it again moves everyone up another level.
                </Alert>
              )}

              {preview.promoted === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing to promote — no active athlete has a level that can move up.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] text-sm">
                  {Object.entries(preview.summary).map(([move, count]) => (
                    <li key={move} className="flex items-center justify-between px-3 py-2">
                      <span>{move.replace('->', '→')}</span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}

              <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc pl-4">
                {preview.atLastLevel > 0 && (
                  <li>
                    {preview.atLastLevel} already at the last level (4th Year / Grade 12) stay as
                    they are — mark graduates inactive yourself.
                  </li>
                )}
                {preview.notSet > 0 && (
                  <li>{preview.notSet} have no year level set and are skipped.</li>
                )}
                <li>Inactive athletes are not changed.</li>
              </ul>

              {recent && preview.promoted > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#0066FF]"
                    checked={confirmAgain}
                    onChange={(e) => setConfirmAgain(e.target.checked)}
                  />
                  <span>I understand this will move everyone up again.</span>
                </label>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" disabled={running} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={running} disabled={!canRun} onClick={() => void run()}>
              {preview && preview.promoted > 0
                ? `Promote ${preview.promoted} athlete${preview.promoted === 1 ? '' : 's'}`
                : 'Promote'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
