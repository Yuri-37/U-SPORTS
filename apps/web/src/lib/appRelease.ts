/**
 * Facts about the current Android release, shown on the App Details page.
 * Update this with every APK release.
 *
 * `downloadUrl` uses GitHub's "latest" redirect, which only stays valid if
 * every release uploads its APK under the same asset name (`U-Sports.apk`).
 * Rename the file before uploading, or this link breaks.
 */
export const APP_RELEASE = {
  version: '1.7.0',
  releasedAt: '2026-09-22',
  sizeMb: 55.5,
  /** Flutter's default minSdk (24) for this project. */
  minAndroid: 'Android 7.0 or newer',
  downloadUrl: 'https://github.com/Yuri-37/U-SPORTS/releases/latest/download/U-Sports.apk',
} as const

/** Permissions the release APK actually requests, in plain language. */
export const APP_PERMISSIONS = [
  { name: 'Internet and network status', why: 'Loads live scores and results.' },
  { name: 'Notifications', why: 'Schedule updates and announcements.' },
  { name: 'Camera and photos', why: 'Only when you choose to set a profile picture.' },
  { name: 'Vibrate and keep awake', why: 'Lets notifications arrive while the phone is idle.' },
] as const
