import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server.ts', () => ({}))

// The provider memoizes one WebDAV client, so all tests share this spy.
const { getFileContents } = vi.hoisted(() => ({ getFileContents: vi.fn() }))
vi.mock('webdav', () => ({ createClient: () => ({ getFileContents }) }))

import { getNextcloudImageProvider } from './nextcloud.provider.server'

describe('nextcloud image provider — fetchThumbnail', () => {
  afterEach(() => {
    getFileContents.mockReset()
    vi.unstubAllGlobals()
  })

  it('serves the pre-generated webp derivative when it exists, without touching the preview endpoint', async () => {
    getFileContents.mockResolvedValue({
      data: new ArrayBuffer(8),
      headers: { etag: '"abc"' },
      status: 200,
      statusText: 'OK',
    })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const payload = await getNextcloudImageProvider().fetchThumbnail('/topos/138.jpg', { width: 160 })

    // width 160 → the 256 derivative (smallest that still downscales)
    expect(getFileContents).toHaveBeenCalledWith(
      expect.stringMatching(/\/topos\/138\.256\.webp$/),
      expect.objectContaining({ details: true }),
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(payload.headers.get('content-type')).toBe('image/webp')
    expect(payload.status).toBe(200)
  })

  it('falls back to an aspect-preserving Nextcloud preview when the derivative is missing', async () => {
    getFileContents.mockRejectedValue(new Error('Not Found'))
    const fetch = vi.fn((_url: URL | RequestInfo, _init?: RequestInit) =>
      Promise.resolve(new Response(new ArrayBuffer(8), { status: 200, statusText: 'OK' })),
    )
    vi.stubGlobal('fetch', fetch)

    const payload = await getNextcloudImageProvider().fetchThumbnail('/topos/138.jpg', { width: 160 })

    const url = new URL(fetch.mock.calls[0][0].toString())
    expect(url.pathname).toBe('/index.php/core/preview.png')
    expect(url.searchParams.get('file')).toBe('/topos/138.jpg')
    expect(url.searchParams.get('x')).toBe('160')
    expect(url.searchParams.get('y')).toBe('160')
    expect(url.searchParams.get('a')).toBe('1') // preserve aspect → overlay stays aligned

    const headers = fetch.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Basic /)
    expect(payload.status).toBe(200)
  })

  it('throws on a non-ok preview response so the route can fall back to the original', async () => {
    getFileContents.mockRejectedValue(new Error('Not Found'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404, statusText: 'Not Found' })),
    )

    await expect(getNextcloudImageProvider().fetchThumbnail('/topos/nope.jpg', { width: 160 })).rejects.toThrow(/404/)
  })
})
