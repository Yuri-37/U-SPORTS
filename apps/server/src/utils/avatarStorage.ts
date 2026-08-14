import supabase from './supabase'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const AVATAR_ALLOWED_MIMES = new Set(Object.keys(MIME_EXT))
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

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
