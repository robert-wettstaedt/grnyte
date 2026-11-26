import { authClient, session, type Stored } from '$lib/zero/authClient.test-helper'
import { mutators } from '$lib/zero/mutators'
import { queries } from '$lib/zero/queries'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubIndexedDb } from './indexedDbStub.test-helper'

// The edges: the SDK, the Zero client, the environment, Kit's query proxy and the exit, which jsdom cannot follow.
const exit = vi.hoisted(() => ({ leaving: false, to: [] as (string | undefined)[] }))
vi.mock('$lib/state/pwa/wipe', () => ({
  isLeaving: () => exit.leaving,
  setLeaving: (value: boolean) => (exit.leaving = value),
  wipeAndLeave: async (to?: string) => {
    exit.leaving = true
    exit.to.push(to)
  },
}))
vi.mock('$env/dynamic/public', () => ({ env: {} }))
vi.mock('$app/environment', () => ({ browser: true, building: false, dev: true, version: '' }))
const remote = vi.hoisted(() => ({ error: undefined as unknown }))
vi.mock('$lib/zero/read.remote', () => ({
  readQuery: () => {
    const proxy = { current: [], error: undefined as unknown, refresh: async () => void (proxy.error = remote.error) }
    return proxy
  },
}))
vi.mock('zero-svelte', () => ({
  Z: class {
    connection = { connect: async () => {}, state: { subscribe: () => () => {} } }
    get userID() {
      return this.options.userID
    }
    constructor(readonly options: { userID: string }) {}
    close = () => {}
  },
}))
vi.mock('@powersync/web', async (original) => ({
  ...(await original<object>()),
  PowerSyncDatabase: class {
    currentStatus = { connected: true, hasSynced: false, statusForPriority: () => ({ hasSynced: false }) }
    close = async () => {}
    connect = async () => {}
    disconnect = async () => {}
    disconnectAndClear = async () => {}
    getOptional = async () => null
    onChange = () => () => {}
    registerListener = () => () => {}
    waitForReady = async () => {}
  },
}))

const A = { token: 'a1', userId: 'a' }
const gone = { code: 'session_not_found' }
const settle = () => vi.advanceTimersByTimeAsync(0)
const reload = vi.fn()
const sent = vi.fn<(url: string) => Promise<Response>>()
const stops: (() => void)[] = []

async function engine(stored: Stored, refresh?: () => unknown) {
  const client = authClient(stored, refresh)
  const supabase = { auth: client.auth } as unknown as SupabaseClient
  const module = await import('./engine.powersync')
  const { getPowerSync } = await import('$lib/powersync/db.svelte')
  const start = (next: null | Session | undefined) => module.start(next, supabase)
  /** What `start` answers, or that it stays open. */
  const answer = async (next: null | Session | undefined) => {
    const held = Symbol('held')
    const result = Promise.race([Promise.resolve(start(next)), new Promise((done) => setTimeout(done, 60_000, held))])
    await vi.advanceTimersByTimeAsync(60_000)
    return (await result) === held ? 'held' : await result
  }
  return { answer, auth: client.auth, getPowerSync, module, start, state: client.state }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  Object.assign(exit, { leaving: false, to: [] })
  remote.error = undefined
  reload.mockReset()
  sent.mockReset().mockImplementation(async () => Response.json({ data: null }))
  stubIndexedDb(['grnyte-a.sqlite', 'grnyte-b.sqlite'])
  vi.stubGlobal('location', { ...location, reload, replace: vi.fn() })
  vi.stubGlobal('fetch', sent)
})
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('starting', () => {
  it('answers nothing the first time, nor for a new token of the same account', async () => {
    const { answer } = await engine(A)

    expect(await answer(session(A))).toBeUndefined()
    expect(await answer(session({ token: 'a2', userId: 'a' }))).toBeUndefined()
  })

  it('as another account stays open and reloads once, whoever starts after it', async () => {
    const { answer } = await engine(A)
    await answer(session(A))

    expect(await answer(session({ token: 'b1', userId: 'b' }))).toBe('held')
    expect(await answer(session({ token: 'b2', userId: 'b' }))).toBe('held')
    expect(await answer(session(A))).toBe('held')
    expect(reload).toHaveBeenCalledOnce()
    expect(exit).toEqual({ leaving: true, to: [] })
  })

  it('without a session, with nothing stored, stays open and leaves for the start page', async () => {
    const { answer, start, state } = await engine(A)
    start(session(A))
    state.stored = null

    expect(await answer(null)).toBe('held')
    expect(exit.to).toEqual(['/'])
    expect(await answer(session(A))).toBe('held')
  })

  it('without a session that can be read answers the last one, and keeps its database', async () => {
    const { answer, getPowerSync, start, state } = await engine(A)
    start(session(A))
    start(session({ token: 'a2', userId: 'a' }))
    state.readError = { name: 'AuthRetryableFetchError' }

    expect(await answer(null)).toEqual(session({ token: 'a2', userId: 'a' }))
    expect(getPowerSync()).toBeDefined()
    expect(exit.to).toEqual([])
  })

  it('without a session that was renewed meanwhile answers it', async () => {
    const { answer, start, state } = await engine(A)
    start(session(A))
    state.stored = { token: 'a2', userId: 'a' }

    expect(await answer(null)).toEqual(session({ token: 'a2', userId: 'a' }))
  })

  it('keeps a renewed session as the last one', async () => {
    const { answer, start, state } = await engine(A)
    start(session(A))
    state.stored = { token: 'a2', userId: 'a' }
    await answer(null)
    state.readError = { name: 'AuthRetryableFetchError' }

    expect(await answer(null)).toEqual(session({ token: 'a2', userId: 'a' }))
  })

  it('without a session where another account is stored by now takes the switch', async () => {
    const { answer, start, state } = await engine(A)
    start(session(A))
    state.stored = { token: 'b1', userId: 'b' }

    expect(await answer(null)).toBe('held')
    expect(reload).toHaveBeenCalledOnce()
    expect(exit.to).toEqual([])
  })

  it('stays open after a switch although a refused deletion says the tab is not leaving', async () => {
    const { answer, start } = await engine(A)
    start(session(A))
    start(session({ token: 'b1', userId: 'b' }))
    await settle()
    exit.leaving = false

    expect(await answer(session({ token: 'b1', userId: 'b' }))).toBe('held')
  })

  it('sends a tab that is leaving already nowhere else', async () => {
    const { answer, start, state } = await engine(A)
    start(session(A))
    state.stored = null
    exit.leaving = true
    await answer(null)

    expect(exit.to).toEqual([])
  })
})

describe('an auth event', () => {
  it('without a session has not moved it, with another token it has', async () => {
    const { module } = await engine(A)

    expect(module.sessionMoved(null, session(A))).toBe(false)
    expect(module.sessionMoved(session(A), session(A))).toBe(false)
    expect(module.sessionMoved(session({ token: 'a2', userId: 'a' }), session(A))).toBe(true)
  })
})

describe('after a start', () => {
  const save = async () => {
    const { write } = await import('$lib/zero/write.powersync')
    await write(mutators.favorites.set({ entityId: 7, entityType: 'area', saved: true, userId: 1 })).catch(() => {})
    await settle()
  }
  const writes = () => sent.mock.calls.filter(([url]) => url === '/api/sync/mutate').length
  /** A server read on screen. */
  const read = async () => {
    const { createResource } = await import('$lib/zero/resource.svelte')
    const { defaultSource } = await import('$lib/zero/source.powersync.svelte')
    const stop = $effect.root(() => {
      const resource = createResource(
        () => queries.listEvents({}),
        (events) => events,
        { source: defaultSource },
      )
      $effect(() => void [resource.data, resource.phase])
    })
    stops.push(stop)
    flushSync()
    await vi.advanceTimersByTimeAsync(100)
  }
  const refused = (status: number) => Object.assign(new Error('refused'), { status })

  it('a write with nothing stored sends nothing and leaves', async () => {
    const { start, state } = await engine(A)
    start(session(A))
    state.stored = null
    await save()

    expect(writes()).toBe(0)
    expect(exit.to).toEqual(['/'])
  })

  it('a read refused with 401 and nothing stored leaves', async () => {
    const { start, state } = await engine(A)
    start(session(A))
    state.stored = null
    remote.error = refused(401)
    await read()

    expect(exit.to).toEqual(['/'])
  })

  it('a write refused with 401 whose session is gone leaves', async () => {
    const { start, state } = await engine(A, () => gone)
    start(session(A))
    sent.mockImplementation(async () => Response.json({}, { status: 401 }))
    await save()

    expect([writes(), state.stored]).toEqual([1, null])
    expect(exit.to).toEqual(['/'])
  })

  it('a write and a read stay when the session cannot be read', async () => {
    const { start, state } = await engine(A)
    start(session(A))
    state.readError = { name: 'AuthUnknownError' }
    remote.error = refused(401)
    await save()
    await read()

    expect(exit.to).toEqual([])
  })
  it('never leaves in a document that started signed out, a write and a read included', async () => {
    const { answer } = await engine(null)
    await answer(null)
    await answer(null)
    remote.error = refused(401)
    await save()
    await read()

    expect(exit.to).toEqual([])
  })
  it('a session check that throws signs nobody out, and the write fails as a refusal', async () => {
    const { auth, start } = await engine(A)
    start(session(A))
    sent.mockImplementation(async () => Response.json({}, { status: 401 }))
    const { write } = await import('$lib/zero/write.powersync')
    vi.spyOn(auth, 'getSession')
      .mockResolvedValueOnce({ data: { session: session(A) }, error: null })
      .mockRejectedValue(new Error('storage'))

    const result = expect(
      write(mutators.favorites.set({ entityId: 7, entityType: 'area', saved: true, userId: 1 })),
    ).rejects.toEqual({ body: { field: undefined, message: JSON.stringify({ message: 'error_server_title' }) } })
    await vi.advanceTimersByTimeAsync(5_000)
    await result
    expect(exit.to).toEqual([])
  })
})
