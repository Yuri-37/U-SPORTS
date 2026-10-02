import { useEffect, useState } from 'react'

/** True while the viewport matches the CSS media query; updates live on resize/rotate. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** The width at which the signed-in sidebar stops being a slide-in drawer. */
export const DESKTOP_QUERY = '(min-width: 1024px)'
