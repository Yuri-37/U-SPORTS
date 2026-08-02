const STORAGE_PREFIX = 'usports.hub.studentBanner.'

export type HubStudentBannerKind = 'unverified' | 'verified'

function storageKey(userId: string, kind: HubStudentBannerKind): string {
  return `${STORAGE_PREFIX}${userId}.${kind}`
}

export function isHubStudentBannerDismissed(userId: string, kind: HubStudentBannerKind): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(storageKey(userId, kind)) === '1'
  } catch {
    return false
  }
}

/** Persist "don't show again" for the student hub enrollment banners (per device). */
export function dismissHubStudentBanner(userId: string, kind: HubStudentBannerKind): void {
  try {
    window.localStorage.setItem(storageKey(userId, kind), '1')
  } catch {
    /* private mode / quota */
  }
}
