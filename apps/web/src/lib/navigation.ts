export function safeInternalPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) return null
  if (!path.startsWith('/') || path.startsWith('//')) return null
  if (path.includes('..')) return null

  // Legacy `/student` hub merged into `/guest`
  if (path === '/student' || path.startsWith('/student?')) {
    return path === '/student' ? '/guest' : `/guest${path.slice('/student'.length)}`
  }

  return path
}

/**
 * Default landing route after authentication (dashboard or shared browse shell).
 * Hub / standings / events for signed-in users use paths under `/guest/*` for everyone.
 */
/**
 * Super admins are intentionally excluded from root redirects — `/` always
 * lands on the guest hub. They reach their panel via Ctrl+Shift+A or the
 * direct `/super-admin` URL. All other authenticated roles go to their own
 * dashboards.
 */
export function defaultPostLoginPath(role: string | undefined): string {
  switch (role) {
    case 'Organizer':
    case 'Coach':
      // Coaches share the staff shell for now; a dedicated coach dashboard lands in a later phase.
      return '/organizer'
    case 'Athlete':
      return '/athlete'
    case 'Admin':
    default:
      return '/guest'
  }
}
