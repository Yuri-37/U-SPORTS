import { isRouteErrorResponse, useRouteError, Link } from 'react-router'
import { Home } from 'lucide-react'
import { EmptyState, Button } from '../../components/ui'

/**
 * Root-level errorElement (see router.tsx). React Router replaces the whole
 * routed tree with this on: an unmatched path (404), or any render/loader
 * error thrown by a route or its descendants that isn't caught closer down.
 */
export default function RouteErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-6">
      <EmptyState
        icon={notFound ? '🔍' : '⚠️'}
        title={notFound ? 'Page not found' : 'Something went wrong'}
        description={
          notFound
            ? "The page you're looking for doesn't exist or may have moved."
            : 'An unexpected error occurred. Reloading usually fixes it — if not, try again later.'
        }
        action={
          <Link to="/">
            <Button variant="primary" icon={<Home className="w-4 h-4" />}>
              Back to home
            </Button>
          </Link>
        }
      />
    </div>
  )
}
