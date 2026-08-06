import { describe, expect, it } from 'vitest'
import {
  extensionOf,
  formatFileSize,
  imageMimeOf,
  imageRejection,
  isHeic,
  isImageFileName,
  isValidSource,
  isVideoFile,
  MAX_IMAGE_SIZE,
  normalizeSource,
  sourceHost,
  stagingPath,
} from './upload'

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

describe('formatFileSize', () => {
  it('switches to GB at the gigabyte boundary', () => {
    expect(formatFileSize(MAX_IMAGE_SIZE)).toBe('50.0 MB')
    expect(formatFileSize(2 * 1024 ** 3)).toBe('2.0 GB')
  })
})

describe('normalizeSource / isValidSource', () => {
  it('prefixes a bare host and leaves an explicit scheme alone', () => {
    expect(normalizeSource(' youtube.com/watch?v=x ')).toBe('https://youtube.com/watch?v=x')
    expect(normalizeSource('http://vimeo.com/1')).toBe('http://vimeo.com/1')
  })

  it('treats blank input as no source, which is valid', () => {
    expect(normalizeSource('   ')).toBeUndefined()
    expect(isValidSource(undefined)).toBe(true)
  })

  it('rejects what the server z.url() would refuse', () => {
    // A dotless host parses as a URL but is never a real origin, so it must not pass.
    expect(isValidSource(normalizeSource('youtube'))).toBe(false)
    expect(isValidSource(normalizeSource('instagram.com/reel/1'))).toBe(true)
  })
})

describe('sourceHost', () => {
  it('credits the host of a followable URL', () => {
    expect(sourceHost('https://www.youtube.com/watch?v=x')).toBe('www.youtube.com')
    expect(sourceHost('http://vimeo.com/1')).toBe('vimeo.com')
  })

  it('refuses a scheme that is not worth linking, however well it parses', () => {
    // Whatever this returns becomes an href. `javascript:` parses as a URL, and with an
    // authority it even yields a hostname that reads like a video site, so returning one
    // would put a script-scheme link on the page under a plausible label.
    expect(sourceHost('javascript:alert(1)')).toBeUndefined()
    expect(sourceHost('javascript://example.com/%0aalert(1)')).toBeUndefined()
    expect(sourceHost('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(sourceHost('mailto:someone@example.com')).toBeUndefined()
  })

  it('leaves legacy free text as no host at all', () => {
    expect(sourceHost('filmed by Jonas')).toBeUndefined()
    expect(sourceHost(undefined)).toBeUndefined()
  })
})

describe('imageRejection', () => {
  // Only name and size are read, and a real File big enough to test the cap would be 50MB.
  const file = (name: string, size: number) => ({ name, size }) as File

  it('accepts a supported image within the size cap', () => {
    expect(imageRejection(file('IMG_2041.HEIC', 1024))).toBeNull()
    expect(imageRejection(file('a.jpg', MAX_IMAGE_SIZE))).toBeNull()
  })

  it('rejects an unsupported type before complaining about size', () => {
    // Type wins: a 90MB PDF is refused for being a PDF, which is the actionable reason.
    expect(imageRejection(file('notes.pdf', MAX_IMAGE_SIZE * 2))).toBe('invalidType')
  })

  it('rejects an oversized image', () => {
    expect(imageRejection(file('huge.jpg', MAX_IMAGE_SIZE + 1))).toBe('tooLarge')
  })
})
