import { describe, expect, it } from 'vitest'
import { extensionOf, imageMimeOf, isHeic, isImageFileName, isVideoFile, stagingPath } from './upload'

describe('extensionOf', () => {
  it('lowercases and strips the dot', () => {
    expect(extensionOf('IMG_2041.JPG')).toBe('jpg')
    expect(extensionOf('photo.heic')).toBe('heic')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
  })

  it('returns null without an extension', () => {
    expect(extensionOf('README')).toBeNull()
    expect(extensionOf('trailing.')).toBeNull()
  })
})

describe('isImageFileName / isHeic', () => {
  it('accepts the supported raster formats only', () => {
    expect(isImageFileName('a.jpeg')).toBe(true)
    expect(isImageFileName('a.HEIC')).toBe(true)
    expect(isImageFileName('a.svg')).toBe(false)
    expect(isImageFileName('a.mp4')).toBe(false)
  })

  it('flags heic/heif for conversion', () => {
    expect(isHeic('a.heif')).toBe(true)
    expect(isHeic('a.jpg')).toBe(false)
  })
})

describe('isVideoFile', () => {
  it('routes by MIME type, rescuing empty-MIME files by extension', () => {
    expect(isVideoFile(new File([], 'clip.weird', { type: 'video/quicktime' }))).toBe(true)
    expect(isVideoFile(new File([], 'clip.MOV', { type: '' }))).toBe(true)
    expect(isVideoFile(new File([], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false)
  })
})

describe('imageMimeOf', () => {
  it('falls back by extension when the browser reports an empty MIME type', () => {
    expect(imageMimeOf('IMG_2041.HEIC')).toBe('image/heic')
    expect(imageMimeOf('a.jpg')).toBe('image/jpeg')
    expect(imageMimeOf('a.txt')).toBeUndefined()
  })
})

describe('stagingPath', () => {
  it('prefixes the auth uid (the RLS scope) and keeps the extension', () => {
    const path = stagingPath('7f9c0e4a-uid', 'IMG_2041.JPG')
    expect(path).toMatch(/^7f9c0e4a-uid\/[a-z0-9]+\.jpg$/)
  })

  it('generates distinct names for the same input', () => {
    expect(stagingPath('uid', 'a.png')).not.toBe(stagingPath('uid', 'a.png'))
  })
})
