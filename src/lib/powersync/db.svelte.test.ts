import { stubIndexedDb } from '$lib/state/indexedDbStub.test-helper'
import { SyncStreamConnectionMethod, type PowerSyncBackendConnector, type SyncOptions } from '@powersync/web'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine and IndexedDB are the external dependencies faked; the shell is read through its exports only.
const engine = vi.hoisted(() => ({
  /** The file each connect was made on, beside `connectOptions`. */
  connectFiles: [] as string[],
  connectOptions: [] as (SyncOptions | undefined)[],
  connectors: [] as PowerSyncBackendConnector[],
  files: [] as string[],
  /** Each database's status listeners, by file, until disposed. */
  listeners: new Map<string, (status: object) => void>(),
  /** Rows the collections have not taken in yet, across their tracking tables. */
  pending: 0,
  status: { connected: false } as object,
  /** Whether the signed-in user's row is in the local database. */
  userRow: false,
}))

vi.mock('$app/environment', () => ({ browser: true, dev: true }))
vi.mock('@powersync/web', async (original) => ({
  ...(await original<object>()),
  PowerSyncDatabase: class {
    readonly file: string
    get currentStatus() {
      return engine.status
    }
    constructor(options: { database: { dbFilename: string } }) {
      this.file = options.database.dbFilename
      engine.files.push(this.file)
    }
    close = () => Promise.resolve()
    connect = (connector: PowerSyncBackendConnector, options?: SyncOptions) => {
      engine.connectors.push(connector)
      engine.connectOptions.push(options)
      engine.connectFiles.push(this.file)
      return Promise.resolve()
    }
    disconnect = () => Promise.resolve()
    disconnectAndClear = () => Promise.resolve()
    getOptional = async () => (engine.userRow ? { 1: 1 } : null)
    registerListener = (listener: { statusChanged: (status: object) => void }) => {
      engine.listeners.set(this.file, listener.statusChanged)
      return () => engine.listeners.delete(this.file)
    }
    waitForReady = () => Promise.resolve()
    // The connection's temp tables: this tab's, plus one a closed tab left on the shared connection.
    writeLock = <T>(run: (tx: object) => Promise<T>) =>
      run({
        get: async (sql: string) => ({ n: sql.includes('__orphan') ? 5 : engine.pending }),
        getAll: async (_sql: string, names: string[]) =>
          ['__grades_tracking_1', '__orphan_tracking_9']
            .filter((name) => names.includes(name))
            .map((name) => ({ name })),
      })
  },
}))

/** A status as PowerSync reports it: which priorities have synced, and whether everything has. */
const synced = (priorities: number[], all: boolean) => ({
  connected: true,
  hasSynced: all,
  statusForPriority: (priority: number) => ({ hasSynced: priorities.includes(priority) }),
})

const session = (id: string) => ({ access_token: `stale-${id}`, user: { id } }) as Session
const settings = { endpoint: 'https://sync.example' }
const settle = () => vi.advanceTimersByTimeAsync(0)
/** A status change as account a's database announces it to its listener. */
const announce = (status: object) => engine.listeners.get('grnyte-a.sqlite')?.(status)

describe('the PowerSync shell', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    Object.assign(engine, {
      connectFiles: [],
      connectOptions: [],
      connectors: [],
      files: [],
      listeners: new Map(),
      pending: 0,
      status: synced([], false),
      userRow: false,
    })
    localStorage.clear()
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

  it('ends the database worker as the page leaves, so the next page can open the file', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        terminate = vi.fn()
        constructor(_url: string, _options?: WorkerOptions) {}
      },
    )
    const { initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    const database = new Worker('worker.js', { name: 'powersync-grnyte-a.sqlite' })
    const other = new Worker('worker.js', { name: 'other' })

    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))

    expect(database.terminate).toHaveBeenCalled()
    expect(other.terminate).not.toHaveBeenCalled()
  })

  it('streams over WebSocket, on the first connect and on the restart after a stale return', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const visibility = vi.spyOn(document, 'visibilityState', 'get')

    // Its own account: earlier tests' module copies restart their files on the same return, never this one.
    initPowerSync(session('ws'), async () => 'token', settings)
    await settle()
    const mine = () =>
      engine.connectFiles.flatMap((file, i) => (file === 'grnyte-ws.sqlite' ? [engine.connectOptions[i]] : []))
    const first = mine().length
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5_000)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(first).toBe(1)
    expect(mine()).toHaveLength(2)
    expect(mine().map((o) => o?.connectionMethod)).toEqual([
      SyncStreamConnectionMethod.WEB_SOCKET,
      SyncStreamConnectionMethod.WEB_SOCKET,
    ])
  })

  it('confirms a stream only once it synced after the file opened and the collections took its rows in', async () => {
    const { getPowerSync, initPowerSync, registerCollections, streamConfirmed } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    registerCollections(getPowerSync(), () => ['__grades_tracking_1'])
    const report = (lastSyncedAt: number) =>
      engine.listeners.get('grnyte-a.sqlite')?.({
        ...synced([0], false),
        syncStreams: [{ subscription: { hasSynced: true, lastSyncedAt: new Date(lastSyncedAt), name: 'essentials' } }],
      })

    // Read off disk on open: a previous session's sync says nothing about what the server holds now.
    report(Date.now() - 60_000)
    await vi.advanceTimersByTimeAsync(200)
    expect(streamConfirmed('essentials')).toBe(false)

    engine.pending = 3
    report(Date.now() + 1)
    await vi.advanceTimersByTimeAsync(200)
    expect(streamConfirmed('essentials')).toBe(false)

    // A closed tab's tracking table still holds rows on the shared connection; it is not this tab's to wait for.
    engine.pending = 0
    await vi.advanceTimersByTimeAsync(1_000)
    expect(streamConfirmed('essentials')).toBe(true)
  })

  it('deletes every account file on sign-out, including ones this page never opened', async () => {
    const deleted = stubIndexedDb(['grnyte-a.sqlite', 'grnyte-old.sqlite', 'rep:zero'])
    const { clearPowerSync, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)

    await clearPowerSync()

    expect(deleted.sort()).toEqual(['grnyte-a.sqlite', 'grnyte-old.sqlite'])
  })

  it('still deletes the open file where IndexedDB cannot list its databases (Firefox before 126)', async () => {
    const deleted = stubIndexedDb(undefined)
    const { clearPowerSync, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)

    await clearPowerSync()

    expect(deleted).toEqual(['grnyte-a.sqlite'])
  })

  it('stamps the essentials once priority 0 has synced, and the guidebook once everything has', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { lastSyncedAt, localStoreLoaded } = await import('$lib/state/sync.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(localStoreLoaded()).toBe(true)
    expect(lastSyncedAt('reference')).toBeNull()

    announce(synced([0], false))
    expect(lastSyncedAt('reference')).not.toBeNull()
    expect(lastSyncedAt('guidebook')).toBeNull()

    announce(synced([0, 1, 2], true))
    expect(lastSyncedAt('guidebook')).not.toBeNull()
  })

  // Warm once a local read finds the signed-in user, so offline it is never taken for cold.
  it.each([
    { userRow: true, warm: true },
    { userRow: false, warm: false },
  ])('calls an open store warm exactly when it holds the signed-in user ($userRow)', async ({ userRow, warm }) => {
    engine.userRow = userRow
    const { initPowerSync } = await import('./db.svelte')
    const { localStoreLoaded, localStoreWarm } = await import('$lib/state/sync.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(localStoreLoaded()).toBe(true)
    expect(localStoreWarm()).toBe(warm)
  })

  it('never writes the next account stamps from the previous account status', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { lastSyncedAt } = await import('$lib/state/sync.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    const fromA = engine.listeners.get('grnyte-a.sqlite')

    initPowerSync(session('b'), async () => 'token', settings)
    await settle()
    // A disconnecting announces its last status, synced, after B is already the open account.
    fromA?.(synced([0, 1, 2], true))

    expect([lastSyncedAt('reference'), lastSyncedAt('guidebook')]).toEqual([null, null])
  })
})
