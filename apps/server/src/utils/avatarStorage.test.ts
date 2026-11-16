import { describe, it, expect, vi } from 'vitest'

// avatarStorage imports the Supabase client, which needs env this test does not have.
vi.mock('./supabase', () => ({ default: {} }))

import { sniffImageMime } from './avatarStorage'

describe('sniffImageMime', () => {
  it('recognises JPEG, PNG and WebP from the first bytes', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg')
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii'))).toBe('image/webp')
  })

  it('rejects anything else, whatever it was labelled', () => {
    expect(sniffImageMime(Buffer.from('<html></html>'))).toBeNull()
    expect(sniffImageMime(Buffer.from('GIF89a'))).toBeNull()
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull()
  })
})
