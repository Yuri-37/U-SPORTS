import type { TourDefinition, TourId, StaffRole } from './types'
import { adminTour } from './adminTour'
import { organizerTour } from './organizerTour'
import { coachTour } from './coachTour'
import { superAdminNav, organizerNav, coachNav } from '../components/layout/Sidebar'
import { navAnchor } from './anchors'

export const TOURS: Record<TourId, TourDefinition> = {
  admin: adminTour,
  organizer: organizerTour,
  coach: coachTour,
}

/** The one tour a given role auto-starts / sees in the Help Center replay list. */
export function tourForRole(role: string): TourDefinition | null {
  const match = Object.values(TOURS).find((t) => t.roles.includes(role as StaffRole))
  return match ?? null
}

export function toursForRole(role: string): TourDefinition[] {
  return Object.values(TOURS).filter((t) => t.roles.includes(role as StaffRole))
}

if (import.meta.env.DEV) {
  // Drift guard: every `nav-*` target a tour declares must exist in that
  // role's actual Sidebar nav array, or editing coachNav/organizerNav later
  // silently strands a step on the centered fallback with no obvious cause.
  const NAV_BY_ROLE: Record<TourId, { to: string }[]> = {
    admin: superAdminNav,
    organizer: organizerNav,
    coach: coachNav,
  }
  for (const def of Object.values(TOURS)) {
    const navPaths = new Set(NAV_BY_ROLE[def.id].map((item) => item.to))
    for (const step of def.steps) {
      const targets = step.target ? (Array.isArray(step.target) ? step.target : [step.target]) : []
      for (const target of targets) {
        const navMatch = /^\[data-tour="nav-(.+)"\]$/.exec(target)
        if (navMatch && !navPaths.has(navMatch[1])) {
          console.warn(
            `[tours] "${def.id}" step "${step.id}" targets ${navAnchor(navMatch[1])}, ` +
              `but "${navMatch[1]}" is not in ${def.id}'s Sidebar nav. The step will fall back to a centered card.`,
          )
        }
      }
    }
  }
}
