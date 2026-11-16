import supabase from './supabase'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const AVATAR_ALLOWED_MIMES = new Set(Object.keys(MIME_EXT))
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/**
 * The real image type from the file's first bytes, or null when it is not a
 * JPEG, PNG or WebP. Used because some clients (the mobile app's multipart
 * upload) label the part application/octet-stream, and a label is not proof anyway.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function avatarExtension(mimetype: string): string | null {
  return MIME_EXT[mimetype] ?? null
}

/**
 * Upload to the public `avatars` bucket under {profileId}/avatar.<ext> --
 * one object per user, same folder-ownership shape the bucket's RLS
 * policies expect (067_avatars_storage.sql). Clears any existing file(s)
 * first so a re-upload with a different image type (e.g. jpg -> png)
 * can't leave the old one behind under a different path.
 */
export async function uploadAvatarBuffer(params: {
  profileId: string
  buffer: Buffer
  mimetype: string
}): Promise<{ publicUrl: string }> {
  const ext = avatarExtension(params.mimetype)
  if (!ext) throw new Error('Invalid image type')

  await deleteAvatar(params.profileId)

  const objectPath = `${params.profileId}/avatar.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(objectPath, params.buffer, {
    contentType: params.mimetype,
    upsert: true,
  })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath)
  // The path is stable per user, so a re-upload reuses the same URL -- a
  // cache-busting query param makes the change visible without a hard
  // refresh instead of serving a browser/CDN-cached stale image.
  return { publicUrl: `${data.publicUrl}?v=${Date.now()}` }
}

export async function deleteAvatar(profileId: string): Promise<void> {
  const { data: files } = await supabase.storage.from('avatars').list(profileId)
  if (files && files.length > 0) {
    await supabase.storage.from('avatars').remove(files.map((f) => `${profileId}/${f.name}`))
  }
}
