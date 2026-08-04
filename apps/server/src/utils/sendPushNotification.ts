import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import supabase from './supabase'

/**
 * Optional integration: without FIREBASE_SERVICE_ACCOUNT_JSON set, every
 * function here no-ops. The in-app notification (the `notifications` table
 * row) is always written regardless — push is a best-effort add-on, never a
 * blocker for the rest of a request.
 */
function getMessagingClient() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(raw)) })
    }
    return getMessaging()
  } catch (err) {
    console.warn('[push] Firebase Admin init failed:', (err as Error).message)
    return null
  }
}

/** Send a push to every device registered for these profiles. Drops tokens FCM reports as dead. */
export async function sendPushToProfiles(
  recipientIds: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const messaging = getMessagingClient()
  if (!messaging) return

  const unique = [...new Set(recipientIds.filter(Boolean))]
  if (unique.length === 0) return

  const { data: tokenRows, error } = await supabase
    .from('push_tokens')
    .select('token')
    .in('profile_id', unique)
  if (error || !tokenRows || tokenRows.length === 0) return

  const tokens = tokenRows.map((r) => r.token)
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data ?? {},
  })

  const deadTokens = res.responses
    .map((r, i) => (!r.success && isUnregistered(r.error?.code) ? tokens[i] : null))
    .filter((t): t is string => t != null)
  if (deadTokens.length > 0) {
    await supabase.from('push_tokens').delete().in('token', deadTokens)
  }
}

function isUnregistered(code: string | undefined): boolean {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token'
}
