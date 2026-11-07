import type { PowerSyncBackendConnector } from '@powersync/web'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine and IndexedDB are the external dependencies faked; the shell is read through its exports only.
const engine = vi.hoisted(() => ({
  connectors: [] as PowerSyncBackendConnector[],
  files: [] as string[],
  status: { connected: false } as object,
  statusReads: 0,
}))
vi.mock('$app/environment', () => ({ browser: true, dev: true }))
vi.mock('@powersync/web', async (original) => ({
  ...(await original<object>()),
  PowerSyncDatabase: class {
    get currentStatus() {
      engine.statusReads++
      return engine.status
    }
    constructor(options: { database: { dbFilename: string } }) {
      engine.files.push(options.database.dbFilename)
    }
    close = () => Promise.resolve()
    connect = (connector: PowerSyncBackendConnector) => {
      engine.connectors.push(connector)
      return Promise.resolve()
    }
    disconnectAndClear = () => Promise.resolve()
    registerListener = () => () => {}
    waitForReady = () => Promise.resolve()
  },
}))

/** A status as PowerSync reports it: which priorities have synced, and whether everything has. */
const synced = (priorities: number[], all: boolean) => ({
  connected: true,
  hasSynced: all,
  statusForPriority: (priority: number) => ({ hasSynced: priorities.includes(priority) }),
})

const session = (id: string) => ({ access_token: `stale-${id}`, user: { id } }) as Session
const settings = { endpoint: 'https://sync.example', only: false }
const settle = () => vi.advanceTimersByTimeAsync(0)
let visibility: DocumentVisibilityState = 'visible'

describe('the PowerSync shell', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    Object.assign(engine, { connectors: [], files: [], status: synced([], false), statusReads: 0 })
    localStorage.clear()
    visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens one file per account', async () => {
    const { initPowerSync } = await import('./db.svelte')

    initPowerSync(session('a'), async () => 'token', settings)
    initPowerSync(session('a'), async () => 'token', settings)
    initPowerSync(session('b'), async () => 'token', settings)

    expect(engine.files).toEqual(['grnyte-a.sqlite', 'grnyte-b.sqlite'])
  })

  it('asks for the token on every connect instead of keeping the one it started with', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const tokens = ['first', 'refreshed']

    initPowerSync(session('a'), async () => tokens.shift(), settings)
    await settle()
    const [connector] = engine.connectors

    expect(await connector.fetchCredentials()).toEqual({ endpoint: 'https://sync.example', token: 'first' })
    expect(await connector.fetchCredentials()).toEqual({ endpoint: 'https://sync.example', token: 'refreshed' })
  })

  it('reads the status on its own while visible, and stops while hidden', async () => {
    const { initPowerSync, powerSyncStatus } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)

    // A change no event announced, as on iOS Safari.
    engine.status = synced([0], false)
    await vi.advanceTimersByTimeAsync(300)
    expect(powerSyncStatus()).toBe(engine.status)

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    const readsWhenHidden = engine.statusReads
    await vi.advanceTimersByTimeAsync(5_000)
    expect(engine.statusReads).toBe(readsWhenHidden)
  })

  it('deletes every account file on sign-out, including ones this page never opened', async () => {
    const deleted: string[] = []
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'grnyte-a.sqlite' }, { name: 'grnyte-old.sqlite' }, { name: 'rep:zero' }],
      deleteDatabase: (name: string) => {
        deleted.push(name)
        const request = {} as IDBOpenDBRequest
        queueMicrotask(() => request.onsuccess?.({} as Event))
        return request
      },
    })
    const { clearPowerSync, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)

    await clearPowerSync()

    expect(deleted.sort()).toEqual(['grnyte-a.sqlite', 'grnyte-old.sqlite'])
  })

  it('stamps the essentials once priority 0 has synced, and the guidebook once everything has', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { lastSyncedAt, localStoreLoaded } = await import('$lib/state/sync.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(localStoreLoaded()).toBe(true)
    expect(lastSyncedAt('reference')).toBeNull()

    engine.status = synced([0], false)
    await vi.advanceTimersByTimeAsync(300)
    expect(lastSyncedAt('reference')).not.toBeNull()
    expect(lastSyncedAt('guidebook')).toBeNull()

    engine.status = synced([0, 1, 2], true)
    await vi.advanceTimersByTimeAsync(300)
    expect(lastSyncedAt('guidebook')).not.toBeNull()
  })
})
