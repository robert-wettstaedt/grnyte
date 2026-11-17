import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The client and the sync stamps are the external dependencies faked; `initZero` is read through what it starts.
const client = vi.hoisted(() => ({ materialized: 0, preloaded: 0 }))
const stamps = vi.hoisted(() => ({ tracked: [] as (string | undefined)[] }))

vi.mock('$app/environment', () => ({ browser: true, dev: false }))
vi.mock('$env/static/public', async (original) => ({
  ...(await original<object>()),
  PUBLIC_ZERO_URL: 'https://zero.example',
}))
vi.mock('zero-svelte', () => ({
  Z: class {
    connection = { connect: async () => {}, state: { subscribe: () => () => {} } }
    close = () => {}
    materialize = () => {
      client.materialized += 1
      return { addListener: () => () => {}, destroy: () => {} }
    }
    preload = () => {
      client.preloaded += 1
      return { complete: new Promise(() => {}) }
    }
  },
}))
vi.mock('$lib/state/sync.svelte', async (original) => ({
  ...(await original<object>()),
  trackSyncFor: (id: string | undefined) => stamps.tracked.push(id),
}))

const session = (id: string) => ({ access_token: `token-${id}`, user: { id } }) as Session

describe('initZero', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.assign(client, { materialized: 0, preloaded: 0 })
    stamps.tracked = []
  })

  it('preloads and tracks the sync state by default, as the Zero build always has', async () => {
    const { initZero } = await import('./z.svelte')

    initZero(session('a'))

    expect(stamps.tracked).toEqual(['a'])
    expect(client.materialized).toBeGreaterThan(0)
    await vi.waitFor(() => expect(client.preloaded).toBeGreaterThan(0))
  })

  it('with the preload off starts no preload, no store probe and tracks nothing: PowerSync owns that state', async () => {
    const { initZero } = await import('./z.svelte')

    initZero(session('a'), { preload: false })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(stamps.tracked).toEqual([])
    expect(client.materialized).toBe(0)
    expect(client.preloaded).toBe(0)
  })
})
