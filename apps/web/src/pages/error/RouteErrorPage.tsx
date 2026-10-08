import { isRouteErrorResponse, useRouteError, Link } from 'react-router'
import { Home, RefreshCw, SearchX, TriangleAlert } from 'lucide-react'
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
        icon={
          notFound ? (
            <SearchX className="w-12 h-12" aria-hidden />
          ) : (
            <TriangleAlert className="w-12 h-12" aria-hidden />
          )
        }
        title={notFound ? 'Page not found' : 'Something went wrong'}
        description={
          notFound
            ? "The page you're looking for doesn't exist or may have moved."
            : 'An unexpected error occurred. Reloading usually fixes it — if not, try again later.'
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* After a new release an open tab can be holding page files that no
                longer exist; a reload fetches the current ones. */}
            {!notFound && (
              <Button
                variant="primary"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
            )}
            <Link to="/">
              <Button
                variant={notFound ? 'primary' : 'secondary'}
                icon={<Home className="w-4 h-4" />}
              >
                Back to home
              </Button>
            </Link>
          </div>
        }
      />
    </div>
  )
}
