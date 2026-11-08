import { stubIndexedDb } from '$lib/state/indexedDbStub'
import type { PowerSyncBackendConnector } from '@powersync/web'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine and IndexedDB are the external dependencies faked; the shell is read through its exports only.
const engine = vi.hoisted(() => ({
  connectors: [] as PowerSyncBackendConnector[],
  files: [] as string[],
  /** Each database's status listeners, by file, until disposed. */
  listeners: new Map<string, (status: object) => void>(),
  /** Rows the collections have not taken in yet, across their tracking tables. */
  pending: 0,
  status: { connected: false } as object,
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
    connect = (connector: PowerSyncBackendConnector) => {
      engine.connectors.push(connector)
      return Promise.resolve()
    }
    disconnectAndClear = () => Promise.resolve()
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
const settings = { endpoint: 'https://sync.example', only: false }
const settle = () => vi.advanceTimersByTimeAsync(0)
/** A status change as account a's database announces it to its listener. */
const announce = (status: object) => engine.listeners.get('grnyte-a.sqlite')?.(status)

describe('the PowerSync shell', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    Object.assign(engine, {
      connectors: [],
      files: [],
      listeners: new Map(),
      pending: 0,
      status: synced([], false),
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
    initPowerSync(session('a'), async () => 'token', { ...settings, only: true })
    await settle()
    expect(localStoreLoaded()).toBe(true)
    expect(lastSyncedAt('reference')).toBeNull()

    announce(synced([0], false))
    expect(lastSyncedAt('reference')).not.toBeNull()
    expect(lastSyncedAt('guidebook')).toBeNull()

    announce(synced([0, 1, 2], true))
    expect(lastSyncedAt('guidebook')).not.toBeNull()
  })

  it('stamps while Zero still syncs too, since Zero keeps nothing offline to vouch for', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { lastSyncedAt, localStoreLoaded } = await import('$lib/state/sync.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(localStoreLoaded()).toBe(true)

    announce(synced([0, 1, 2], true))
    expect(lastSyncedAt('guidebook')).not.toBeNull()
  })

  it('never writes the next account stamps from the previous account status', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { lastSyncedAt } = await import('$lib/state/sync.svelte')
    const only = { ...settings, only: true }
    initPowerSync(session('a'), async () => 'token', only)
    await settle()
    const fromA = engine.listeners.get('grnyte-a.sqlite')

    initPowerSync(session('b'), async () => 'token', only)
    await settle()
    // A disconnecting announces its last status, synced, after B is already the open account.
    fromA?.(synced([0, 1, 2], true))

    expect([lastSyncedAt('reference'), lastSyncedAt('guidebook')]).toEqual([null, null])
  })
})
