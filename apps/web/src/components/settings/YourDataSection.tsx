import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { Download, Trash2 } from 'lucide-react'
import { Alert, Button, Card, Input, Modal } from '../ui'
import api from '../../lib/api'
import { describeApiError } from '../../lib/apiError'
import { toast } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'

/**
 * "Your data" card for every role's Settings page: the Data Privacy Act
 * (RA 10173) rights the privacy notice promises -- get a copy of your data, and
 * (for athletes) have your account erased.
 */
export default function YourDataSection({ canDelete }: { canDelete: boolean }) {
  const navigate = useNavigate()
  const signOut = useAuthStore((s) => s.signOut)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const download = async () => {
    setDownloading(true)
    setError('')
    try {
      const res = await api.get('/profile/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `u-sports-my-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Your data was downloaded')
    } catch (e: unknown) {
      setError(describeApiError(e, 'Could not download your data'))
    } finally {
      setDownloading(false)
    }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await api.post('/profile/delete-account', { password })
      setConfirmOpen(false)
      toast.success('Your account was deleted')
      await signOut()
      navigate('/', { replace: true })
    } catch (e: unknown) {
      setDeleteError(describeApiError(e, 'Could not delete your account'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-1">Your data</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        You can get a copy of the personal data U-Sports holds about you.{' '}
        {canDelete
          ? 'You can also erase your account: your profile, roster memberships, statistics and notifications are removed.'
          : 'Staff accounts are managed by the Super Admin — ask them to deactivate yours.'}
      </p>
      {error && (
        <Alert type="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={downloading}
          icon={<Download className="w-4 h-4" />}
          onClick={() => void download()}
        >
          Download my data
        </Button>
        {canDelete && (
          <Button
            variant="danger"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => {
              setPassword('')
              setDeleteError('')
              setConfirmOpen(true)
            }}
          >
            Delete my account
          </Button>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!deleting) setConfirmOpen(false)
        }}
        title="Delete your account"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="warning">
            This permanently removes your account, roster memberships, season statistics and
            notifications. It cannot be undone. Team results of events that have already finished stay
            visible as historical records.
          </Alert>
          {deleteError && <Alert type="danger">{deleteError}</Alert>}
          <Input
            label="Enter your password to confirm"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={!password}
              onClick={() => void deleteAccount()}
            >
              Delete my account
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
