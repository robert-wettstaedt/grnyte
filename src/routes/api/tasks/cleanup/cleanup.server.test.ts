/**
 * The staging sweep reads every page of the listing: `list` stops at its limit without saying so,
 * and stale uploads past the first page were never removed.
 */
import { reachable } from '$lib/db/testDb'
import { describe, expect, it, vi } from 'vitest'
import { POST } from './+server'

const DAY = 24 * 60 * 60 * 1000
const FRESH = 1200
const STALE = 300

// One uid folder; its objects sorted by name the way storage lists them, the stale ones last.
const objects = [
  ...Array.from({ length: FRESH }, (_, i) => ({
    created_at: new Date().toISOString(),
    id: `a${i}`,
    name: `a-${String(i).padStart(5, '0')}.jpg`,
  })),
  ...Array.from({ length: STALE }, (_, i) => ({
    created_at: new Date(Date.now() - 2 * DAY).toISOString(),
    id: `z${i}`,
    name: `z-${String(i).padStart(5, '0')}.jpg`,
  })),
]
const removed: string[] = []

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    storage: {
      from: () => ({
        list: async (prefix?: string, { limit = 100, offset = 0 } = {}) => ({
          data: (prefix == null ? [{ id: null, name: 'uid-1' }] : objects).slice(offset, offset + limit),
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths)
          return { data: [], error: null }
        },
      }),
    },
  }),
}))
vi.mock('$lib/remote/cron.server', () => ({ isCronAuthorized: () => true }))
vi.mock('$lib/videos/provider.server', () => ({
  getVideoProvider: () => ({ deleteVideo: async () => {}, listStaleUploads: async () => [] }),
}))
vi.mock('$lib/entities/file/cleanup.server', () => ({ reportBunnyOrphans: async () => {} }))
vi.mock('$lib/entities/file/readiness.server', () => ({ reconcileReadiness: async () => 0 }))
vi.mock('$lib/entities/user/unconfirmed.server', () => ({
  sweepUnconfirmedAccounts: async () => 0,
  UNCONFIRMED_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
}))

describe.skipIf(!reachable)('POST /api/tasks/cleanup, staging', () => {
  it('removes stale uploads beyond the first page of the listing', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/tasks/cleanup', { method: 'POST' }),
      url: new URL('http://localhost/api/tasks/cleanup'),
    } as never)

    expect(response.status).toBe(200)
    expect(removed).toHaveLength(STALE)
    expect(removed.every((path) => path.startsWith('uid-1/z-'))).toBe(true)
  })
})
