import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server.ts', () => ({}))

import { getNextcloudImageProvider } from './nextcloud.provider.server'

describe('nextcloud image provider — fetchThumbnail', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests an aspect-preserving preview at the given width, with basic auth', async () => {
    const fetch = vi.fn(
      (_url: URL | RequestInfo, _init?: RequestInit) => Promise.resolve(new Response(new ArrayBuffer(8), { status: 200, statusText: 'OK' })),
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404, statusText: 'Not Found' })),
    )

    await expect(getNextcloudImageProvider().fetchThumbnail('/topos/nope.jpg', { width: 160 })).rejects.toThrow(/404/)
  })
})
