import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Alert, Button, Input, Modal } from '../ui'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  /** Who the account is for; shown in the confirmation line. */
  name?: string
  email: string
  /** The password the account was created with — the dependable way in. */
  password?: string
  /** A "choose your own password" email was handed to the mail provider. */
  emailed?: boolean
  /** Why the email wasn't sent, when it was attempted and failed. */
  emailError?: string
}

/**
 * Shown right after an account is created, in every place accounts are made.
 *
 * Registration used to depend on an email arriving, with nothing on screen if
 * it didn't: school mail filters (NU's Microsoft tenant in particular) hold
 * or quarantine messages from new senders, so the person registering an
 * account was left with no way to get the new user in. The password is
 * therefore always put in front of the staff member to hand over, and the
 * email is reported honestly as an extra -- sent, or not and why -- instead
 * of being assumed to have worked.
 */
export default function AccountCredentialsModal({
  open,
  onClose,
  title,
  name,
  email,
  password,
  emailed,
  emailError,
}: Props) {
  const [copied, setCopied] = useState(false)

  const close = () => {
    setCopied(false)
    onClose()
  }

  const copy = async () => {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // Clipboard access can be refused (insecure context, denied permission);
      // the password is still selectable in the field above, so just leave the
      // button as it was rather than claiming a copy that didn't happen.
    }
  }

  return (
    <Modal open={open} onClose={close} title={title} size="md">
      <div className="space-y-4">
        <Alert type="success">
          {name ? (
            <>
              <span className="font-semibold">{name}</span> was added with the email{' '}
            </>
          ) : (
            <>Account created for </>
          )}
          <span className="font-semibold">{email}</span>.
        </Alert>

        {password && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-secondary)]">
              Sign-in password — shown once. Copy it now and give it to them directly.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={password} className="font-mono" aria-label="Password" />
              <Button
                variant="secondary"
                icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                onClick={() => void copy()}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}

        {emailed && (
          <Alert type="info">
            A link to choose their own password was also emailed to {email}. It can take a few
            minutes, and school mail filters sometimes hold it in spam or quarantine — the
            password above works either way.
          </Alert>
        )}
        {!emailed && emailError && (
          <Alert type="warning">
            The email could not be sent: {emailError} The account is ready to use with the password
            above.
          </Alert>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={close}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
