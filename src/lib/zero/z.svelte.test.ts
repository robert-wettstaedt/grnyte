import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The client and the sync stamps are the external dependencies faked; `initZero` is read through what it starts.
const client = vi.hoisted(() => ({
  connection: (_state: { name: string }) => {},
  materialized: 0,
  preloaded: 0,
}))
const stamps = vi.hoisted(() => ({ tracked: [] as (string | undefined)[] }))

vi.mock('$app/environment', () => ({ browser: true, dev: false }))
vi.mock('$env/static/public', async (original) => ({
  ...(await original<object>()),
  PUBLIC_ZERO_URL: 'https://zero.example',
}))
vi.mock('zero-svelte', () => ({
  Z: class {
    connection = {
      connect: async () => {},
      state: {
        subscribe: (listener: (state: { name: string }) => void) => {
          client.connection = listener
          return () => {}
        },
      },
    }
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
    vi.stubGlobal('fetch', () => new Promise(() => {}))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('a client unconnected for ten seconds makes the app offline', async () => {
    vi.useFakeTimers()
    const { isOnline } = await import('$lib/state/online.svelte')
    const { initZero } = await import('./z.svelte')

    initZero(session('a'))
    client.connection({ name: 'connecting' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(isOnline()).toBe(false)
  })

  it('preloads and tracks the sync state', async () => {
    const { initZero } = await import('./z.svelte')

    initZero(session('a'))

    expect(stamps.tracked).toEqual(['a'])
    expect(client.materialized).toBeGreaterThan(0)
    await vi.waitFor(() => expect(client.preloaded).toBeGreaterThan(0))
  })
})
