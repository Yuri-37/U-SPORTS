import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import router from './router'
import './styles/index.css'
import { hydrateAppearanceThemeFromStorage } from './stores/appearanceStore'

hydrateAppearanceThemeFromStorage()

/*
  Every route is lazy-loaded, so its code lives in a chunk whose filename
  carries a content hash. A deploy publishes new hashes and drops the old
  files, which means a tab that was already open is holding an index.html
  that points at chunks the server no longer has. The next navigation then
  fails its dynamic import and lands on the router's error page -- the
  "need to refresh after every action" report. Vite raises this as
  `vite:preloadError`; reloading picks up the new index.html and its new
  chunk names.

  The sessionStorage flag keeps a genuinely broken deploy from reloading
  forever: one automatic retry per tab, then the error page is allowed to
  show so the failure is visible rather than hidden behind a reload loop.
*/
const RELOADED_KEY = 'u-sports:chunk-reloaded'
window.addEventListener('vite:preloadError', (event) => {
  let alreadyRetried = false
  try {
    alreadyRetried = sessionStorage.getItem(RELOADED_KEY) === '1'
    if (!alreadyRetried) sessionStorage.setItem(RELOADED_KEY, '1')
  } catch {
    // Private mode / blocked storage: fall through and let the error show
    // rather than risk an unbounded reload loop.
    return
  }
  if (alreadyRetried) return
  event.preventDefault()
  window.location.reload()
})

// A navigation that completes is proof the current chunks resolve, so the
// next stale-deploy reload is allowed to happen.
router.subscribe((state) => {
  if (state.navigation.state === 'idle') {
    try {
      sessionStorage.removeItem(RELOADED_KEY)
    } catch {
      /* storage unavailable — nothing to clear */
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
