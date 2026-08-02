import crypto from 'crypto'
import supabase from './supabase'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export const INSTITUTION_LOGO_ALLOWED_MIMES = new Set(Object.keys(MIME_EXT))
export const INSTITUTION_LOGO_MAX_BYTES = 5 * 1024 * 1024

export function institutionLogoExtension(mimetype: string): string | null {
  return MIME_EXT[mimetype] ?? null
}

/** Upload to public bucket `institution-assets` (service role bypasses RLS). */
export async function uploadInstitutionLogoBuffer(params: {
  buffer: Buffer
  mimetype: string
  folder: 'setup' | 'school'
}): Promise<{ publicUrl: string }> {
  const ext = institutionLogoExtension(params.mimetype)
  if (!ext) throw new Error('Invalid image type')
  const objectPath = `${params.folder}/logo-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('institution-assets').upload(objectPath, params.buffer, {
    contentType: params.mimetype,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('institution-assets').getPublicUrl(objectPath)
  return { publicUrl: data.publicUrl }
}
