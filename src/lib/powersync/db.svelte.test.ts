import { stubIndexedDb } from '$lib/state/indexedDbStub.test-helper'
import {
  SyncStreamConnectionMethod,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type SyncOptions,
} from '@powersync/web'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine and IndexedDB are the external dependencies faked; the shell is read through its exports only.
const engine = vi.hoisted(() => ({
  changes: [] as { file: string; live: boolean; onChange: () => void; tables: string[]; throttleMs?: number }[],
  /** Whether clearing a database fails. */
  clearFails: false,
  /** The file each connect was made on, beside `connectOptions`. */
  connectFiles: [] as string[],
  connectOptions: [] as (SyncOptions | undefined)[],
  connectors: [] as PowerSyncBackendConnector[],
  executed: [] as unknown[][],
  files: [] as string[],
  /** Each database's status listeners, by file, until disposed. */
  listeners: new Map<string, (status: object) => void>(),
  /** Rows the collections have not taken in yet, across their tracking tables. */
  pending: 0,
  /** Refused writes in `write_outcomes`, and the statements the shell ran. */
  queued: 0,
  /** Resolves once the database is open. */
  ready: Promise.resolve(),
  refused: [] as { args: string; id: string; message: string; name: string }[],
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
    // Emptying the tables is a change like any other.
    disconnectAndClear = () => {
      changed(this.file, 'region_counters')
      return engine.clearFails ? Promise.reject(new Error('storage')) : Promise.resolve()
    }
    execute = async (sql: string, parameters: unknown[] = []) => void engine.executed.push([sql, ...parameters])
    get = async () => ({ n: engine.queued })
    getAll = async (sql: string) => (sql.includes('write_outcomes') ? [...engine.refused] : [])
    getOptional = async () => (engine.userRow ? { 1: 1 } : null)
    onChange = (handler: { onChange: () => void }, options: { tables: string[]; throttleMs?: number }) => {
      const entry = { file: this.file, live: true, onChange: handler.onChange, ...options }
      engine.changes.push(entry)
      return () => void (entry.live = false)
    }
    registerListener = (listener: { statusChanged: (status: object) => void }) => {
      engine.listeners.set(this.file, listener.statusChanged)
      return () => engine.listeners.delete(this.file)
    }
    waitForReady = () => engine.ready
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

/** A change to `table` as `file`'s database reports it to its live listeners. */
function changed(file: string, table: string): void {
  for (const entry of engine.changes)
    if (entry.live && entry.file === file && entry.tables.includes(table)) entry.onChange()
}

/** A status as PowerSync reports it: which priorities have synced, and whether everything has. */
const synced = (priorities: number[], all: boolean) => ({
  connected: true,
  hasSynced: all,
  statusForPriority: (priority: number) => ({ hasSynced: priorities.includes(priority) }),
})

const session = (id: string) => ({ access_token: `stale-${id}`, user: { id } }) as Session
const settings = { endpoint: 'https://sync.example', upload: async () => {} }
/** The browser's lock manager, as one page sees it: `request` runs with the lock held by that page, `query` adds to it. */
const locks = { held: [] as LockInfo[], pending: [] as LockInfo[] }
const lockManager = (page: string) => {
  const own: LockInfo[] = []
  return {
    query: async () => ({ held: [...locks.held, ...own], pending: locks.pending }),
    request: async (name: string, run: () => Promise<unknown>) => {
      own.push({ clientId: page, name })
      return await run().finally(() => own.pop())
    },
  }
}
const SYNC_LOCK = 'streaming-sync-sync-grnyte-a.sqlite'
const offline = () => ({ ...synced([], false), connected: false })
/** Account a's shell started, with the online flag it feeds. */
const startShell = async () => {
  const db = await import('./db.svelte')
  const { isOnline } = await import('$lib/state/online.svelte')
  db.initPowerSync(session('a'), async () => 'token', settings)
  await settle()
  return { db, isOnline, syncConnection: db.syncConnection }
}
const settle = () => vi.advanceTimersByTimeAsync(0)
/** A status change as account a's database announces it to its listener. */
const announce = (status: object) => engine.listeners.get('grnyte-a.sqlite')?.(status)

describe('the PowerSync shell', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    Object.assign(engine, {
      changes: [],
      clearFails: false,
      connectFiles: [],
      connectOptions: [],
      connectors: [],
      executed: [],
      files: [],
      listeners: new Map(),
      pending: 0,
      queued: 0,
      ready: Promise.resolve(),
      refused: [],
      status: synced([], false),
      userRow: false,
    })
    localStorage.clear()
    Object.assign(locks, { held: [], pending: [] })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: lockManager('page') })
    vi.stubGlobal('fetch', () => new Promise(() => {}))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (navigator as unknown as Record<string, unknown>).locks
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

  it('holds the refused writes of the open account, follows their table, and forgets a dismissed one', async () => {
    const { dismissRefusal, initPowerSync, refusals } = await import('./db.svelte')
    const refusal = { args: '{}', id: 'w1', message: '{"message":"routes_notFound"}', name: 'ascents.create' }
    engine.refused = [refusal]

    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(refusals()).toEqual([{ ...refusal, href: undefined }])

    engine.refused = []
    changed('grnyte-a.sqlite', 'write_outcomes')
    await settle()
    expect(refusals()).toEqual([])

    await dismissRefusal('w1')
    expect(engine.executed).toEqual([['delete from write_outcomes where id = ?', 'w1']])
  })

  it('offers to reopen a refused form only while its subject is still on the device, after each checkpoint', async () => {
    const { initPowerSync, refusals } = await import('./db.svelte')
    engine.refused = [{ args: '{"routeId":"5"}', id: 'w1', message: '{}', name: 'ascents.create' }]
    engine.userRow = true
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(refusals()[0].href).toBe('/routes/5/ascents/add')

    // The checkpoint that removed the route.
    engine.userRow = false
    announce({ ...synced([0], true), lastSyncedAt: new Date() })
    await settle()

    expect(refusals()[0].href).toBeUndefined()
  })

  it('uploads queued writes through the uploader it was given', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const upload = vi.fn(async () => {})

    initPowerSync(session('a'), async () => 'token', { ...settings, upload })
    await settle()
    const database = {} as AbstractPowerSyncDatabase
    await engine.connectors[0].uploadData(database)

    expect(upload).toHaveBeenCalledWith(database)
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

  it('tells its one listener about a stale return, and nothing of a short one', async () => {
    const { initPowerSync, onStaleReturn } = await import('./db.svelte')
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    const away = async (ms: number) => {
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      vi.advanceTimersByTime(ms)
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()
    }
    const [replaced, told] = [vi.fn(), vi.fn()]
    initPowerSync(session('a'), async () => 'token', settings)
    onStaleReturn(replaced)
    onStaleReturn(told)

    await away(1_000)
    expect(told).not.toHaveBeenCalled()
    await away(5_000)
    expect(told).toHaveBeenCalledOnce()
    expect(replaced).not.toHaveBeenCalled()
  })

  describe('a change marker', () => {
    const away = async (ms: number, during = () => {}) => {
      const visibility = vi.spyOn(document, 'visibilityState', 'get')
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      during()
      vi.advanceTimersByTime(ms)
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()
    }
    const watched = async () => {
      const db = await import('./db.svelte')
      const told = vi.fn()
      db.onMarkerMove('region_counters', told)
      db.initPowerSync(session('a'), async () => 'token', settings)
      return { db, told }
    }

    it('tells its listener when its table changes, and not for another table', async () => {
      const { told } = await watched()

      changed('grnyte-a.sqlite', 'user_counters')
      expect(told).not.toHaveBeenCalled()
      changed('grnyte-a.sqlite', 'region_counters')
      expect(told).toHaveBeenCalledOnce()
    })

    it('tells a listener set after the database opened, and only the latest one', async () => {
      const { initPowerSync, onMarkerMove } = await import('./db.svelte')
      const [replaced, told] = [vi.fn(), vi.fn()]
      initPowerSync(session('a'), async () => 'token', settings)
      onMarkerMove('region_counters', replaced)
      onMarkerMove('region_counters', told)

      changed('grnyte-a.sqlite', 'region_counters')
      expect(told).toHaveBeenCalledOnce()
      expect(replaced).not.toHaveBeenCalled()
    })

    it('asks PowerSync for at most one change a second', async () => {
      const { initPowerSync, onMarkerMove } = await import('./db.svelte')
      onMarkerMove('region_counters', () => {})
      initPowerSync(session('a'), async () => 'token', settings)

      const markers = engine.changes.filter(({ tables }) => !tables.includes('write_outcomes'))
      expect(markers.map(({ tables, throttleMs }) => ({ tables, throttleMs }))).toEqual([
        { tables: ['region_counters'], throttleMs: 1000 },
      ])
    })

    it('stops with the closed database, emptying it included, and goes on with the next account', async () => {
      stubIndexedDb(['grnyte-a.sqlite'])
      const { db, told } = await watched()

      await db.clearPowerSync()
      changed('grnyte-a.sqlite', 'region_counters')
      expect(told).not.toHaveBeenCalled()

      db.initPowerSync(session('b'), async () => 'token', settings)
      changed('grnyte-b.sqlite', 'region_counters')
      expect(told).toHaveBeenCalledOnce()
    })

    it('stops with a switch of account', async () => {
      const { db, told } = await watched()
      db.initPowerSync(session('b'), async () => 'token', settings)
      await settle()

      changed('grnyte-a.sqlite', 'region_counters')
      expect(told).not.toHaveBeenCalled()
    })

    it('holds changes while hidden and tells once on a short return', async () => {
      const { initPowerSync, onMarkerMove } = await import('./db.svelte')
      const told = vi.fn()
      initPowerSync(session('a'), async () => 'token', settings)
      onMarkerMove('region_counters', told)

      await away(1_000, () => {
        changed('grnyte-a.sqlite', 'region_counters')
        changed('grnyte-a.sqlite', 'region_counters')
        expect(told).not.toHaveBeenCalled()
      })
      expect(told).toHaveBeenCalledOnce()
    })

    it('leaves a stale return to the stale listener', async () => {
      const { initPowerSync, onMarkerMove, onStaleReturn } = await import('./db.svelte')
      const [told, stale] = [vi.fn(), vi.fn()]
      initPowerSync(session('a'), async () => 'token', settings)
      onMarkerMove('region_counters', told)
      onStaleReturn(stale)

      await away(5_000, () => changed('grnyte-a.sqlite', 'region_counters'))
      expect(stale).toHaveBeenCalledOnce()
      expect(told).not.toHaveBeenCalled()
    })

    it('tells once when a tab loaded in the background is shown', async () => {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      const { initPowerSync, onMarkerMove } = await import('./db.svelte')
      const told = vi.fn()
      initPowerSync(session('a'), async () => 'token', settings)
      onMarkerMove('region_counters', told)

      changed('grnyte-a.sqlite', 'region_counters')
      expect(told).not.toHaveBeenCalled()
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(told).toHaveBeenCalledOnce()
    })
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

  it("deletes the open account's file on a switch, and no other account's", async () => {
    const deleted = stubIndexedDb(['grnyte-a.sqlite', 'grnyte-b.sqlite'])
    const { dropAccount, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)

    await dropAccount('a')

    expect(deleted).toEqual(['grnyte-a.sqlite'])
  })

  it('mirrors its count of queued writes once open, and drops the count with the file', async () => {
    stubIndexedDb(['grnyte-a.sqlite'])
    engine.queued = 2
    const { dropAccount, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    await settle()
    expect(localStorage.getItem('grnyte-queued-a')).toBe('2')

    await dropAccount('a')

    expect(localStorage.getItem('grnyte-queued-a')).toBeNull()
  })

  it('deletes it on a switch that came through no session', async () => {
    const deleted = stubIndexedDb(['grnyte-a.sqlite'])
    const { dropAccount, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    initPowerSync(null, async () => undefined, settings)

    await dropAccount('a')

    expect(deleted).toEqual(['grnyte-a.sqlite'])
  })

  it('deletes it on a switch even when clearing it failed', async () => {
    const deleted = stubIndexedDb(['grnyte-a.sqlite'])
    const { dropAccount, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    engine.clearFails = true

    await dropAccount('a').catch(() => {})

    expect(deleted).toEqual(['grnyte-a.sqlite'])
  })

  // Firefox: queued behind another tab's blocked delete, which the sync worker holds until this page goes.
  it('does not wait on a delete that never answers, on sign-out or a switch', async () => {
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'grnyte-a.sqlite' }],
      deleteDatabase: () => ({}) as IDBOpenDBRequest,
    })
    const { clearPowerSync, dropAccount, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    const done: string[] = []

    void clearPowerSync().then(() => done.push('clear'))
    void dropAccount('a').then(() => done.push('switch'))
    await vi.advanceTimersByTimeAsync(1_000)

    expect(done.sort()).toEqual(['clear', 'switch'])
  })

  it('still reports a delete refused after the wait', async () => {
    const request = {} as IDBOpenDBRequest
    vi.stubGlobal('indexedDB', { databases: async () => [{ name: 'grnyte-a.sqlite' }], deleteDatabase: () => request })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { clearPowerSync, initPowerSync } = await import('./db.svelte')
    initPowerSync(session('a'), async () => 'token', settings)
    const cleared = clearPowerSync()
    await vi.advanceTimersByTimeAsync(1_000)
    await cleared

    request.onerror?.({} as Event)

    expect(error).toHaveBeenCalledWith(expect.stringContaining('left'), 'grnyte-a.sqlite', undefined)
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
  describe('what the app says about the connection', () => {
    it('a launch that never connects is reconnecting, then offline after ten seconds', async () => {
      engine.status = offline()
      const { isOnline, syncConnection } = await startShell()
      expect([syncConnection(), isOnline()]).toEqual(['connecting', true])

      await vi.advanceTimersByTimeAsync(10_000)
      expect(isOnline()).toBe(false)
    })

    it('losing it for ten seconds makes the app offline, and regaining it online', async () => {
      const { isOnline, syncConnection } = await startShell()
      expect(syncConnection()).toBe('connected')

      announce(offline())
      await vi.advanceTimersByTimeAsync(10_000)
      expect([syncConnection(), isOnline()]).toEqual(['connecting', false])

      announce(synced([], false))
      expect([syncConnection(), isOnline()]).toEqual(['connected', true])
    })

    it('a drop shorter than ten seconds does not make it offline', async () => {
      const { isOnline } = await startShell()

      announce(offline())
      await vi.advanceTimersByTimeAsync(9_000)
      expect(isOnline()).toBe(true)
      announce(synced([], false))
      await vi.advanceTimersByTimeAsync(10_000)

      expect(isOnline()).toBe(true)
    })

    it('a launch already connected is online after a false browser reading', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const { isOnline } = await startShell()

      expect(isOnline()).toBe(true)
    })

    it('before the store is loaded it is neither offline nor reconnecting', async () => {
      engine.status = offline()
      engine.ready = new Promise(() => {})
      const { isOnline, syncConnection } = await startShell()
      announce(offline())
      await vi.advanceTimersByTimeAsync(20_000)

      expect([syncConnection(), isOnline()]).toEqual(['connected', true])
    })

    it('after closing it is not reconnecting, whatever the last status was', async () => {
      stubIndexedDb(['grnyte-a.sqlite'])
      const { db, syncConnection } = await startShell()
      announce(offline())
      expect(syncConnection()).toBe('connecting')

      await db.dropAccount('a')

      expect(syncConnection()).toBe('connected')
    })

    it('a status on a connection that has not noticed keeps it offline, and a newer checkpoint brings it back', async () => {
      const { isOnline } = await startShell()
      announce({ ...synced([], false), lastSyncedAt: new Date(1_000) })
      dispatchEvent(new Event('offline'))
      expect(isOnline()).toBe(false)

      announce({ ...synced([0], false), lastSyncedAt: new Date(1_000) })
      expect(isOnline()).toBe(false)

      announce({ ...synced([0], false), lastSyncedAt: new Date(2_000) })
      expect(isOnline()).toBe(true)
    })

    it("a closed account's late status changes nothing", async () => {
      const { db, isOnline, syncConnection } = await startShell()
      const fromA = engine.listeners.get('grnyte-a.sqlite')
      db.initPowerSync(session('b'), async () => 'token', settings)
      await settle()

      fromA?.(offline())
      await vi.advanceTimersByTimeAsync(10_000)

      expect([syncConnection(), isOnline()]).toEqual(['connected', true])
    })
  })
  describe('while another tab may hold the sync', () => {
    /** How the probe answers; the boot probe and every later one. */
    let probe: () => Promise<Response>
    let probes = 0
    const answers = async () => new Response()
    const heldElsewhere = () =>
      Object.assign(locks, {
        held: [{ clientId: 'other page', name: SYNC_LOCK }],
        pending: [{ clientId: 'page', name: SYNC_LOCK }],
      })
    const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms)

    beforeEach(() => {
      probe = answers
      probes = 0
      vi.stubGlobal('fetch', () => {
        probes += 1
        return probe()
      })
    })

    it('a tab that comes to wait for it only after its first status stays online, reconnecting', async () => {
      engine.status = offline()
      const { isOnline, syncConnection } = await startShell()
      await pass(500)
      heldElsewhere()
      await pass(30_000)

      expect([syncConnection(), isOnline()]).toEqual(['connecting', true])
    })

    it('so does one that restarted its sync', async () => {
      const { isOnline, syncConnection } = await startShell()
      await pass(60_000)

      announce(offline())
      await pass(500)
      heldElsewhere()
      await pass(30_000)

      expect([syncConnection(), isOnline()]).toEqual(['connecting', true])
    })

    it('one that was online and then waits goes offline when a probe fails', async () => {
      const { isOnline } = await startShell()
      probe = () => Promise.reject(new TypeError('Load failed'))
      announce(offline())
      heldElsewhere()
      await pass(2_000)

      expect(isOnline()).toBe(false)
    })

    it('one already offline comes back when a probe succeeds', async () => {
      engine.status = offline()
      const { isOnline } = await startShell()
      await pass(10_000)
      expect(isOnline()).toBe(false)

      heldElsewhere()
      await pass(2_000)

      expect(isOnline()).toBe(true)
    })

    it('one that no longer waits and stays unconnected goes offline after ten seconds', async () => {
      engine.status = offline()
      heldElsewhere()
      const { isOnline } = await startShell()
      await pass(20_000)
      expect(isOnline()).toBe(true)

      Object.assign(locks, { held: [{ clientId: 'page', name: SYNC_LOCK }], pending: [] })
      await pass(12_000)

      expect(isOnline()).toBe(false)
    })

    it('one that holds it itself while another waits goes offline after ten seconds', async () => {
      engine.status = offline()
      Object.assign(locks, {
        held: [{ clientId: 'page', name: SYNC_LOCK }],
        pending: [{ clientId: 'other page', name: SYNC_LOCK }],
      })
      const { isOnline } = await startShell()
      await pass(12_000)

      expect(isOnline()).toBe(false)
    })

    it('a shared connection, whose worker holds it and no page waits, goes offline after ten seconds', async () => {
      engine.status = offline()
      Object.assign(locks, { held: [{ clientId: 'shared worker', name: SYNC_LOCK }], pending: [] })
      const { isOnline } = await startShell()
      await pass(12_000)

      expect(isOnline()).toBe(false)
    })

    it('a tab that waits a minute sends one probe', async () => {
      engine.status = offline()
      heldElsewhere()
      await startShell()
      const atBoot = probes
      await pass(60_000)

      expect(probes - atBoot).toBe(1)
    })

    it('a tab that waits a second time, after it was connected, stays online again', async () => {
      engine.status = offline()
      heldElsewhere()
      const { isOnline, syncConnection } = await startShell()
      await pass(5_000)
      announce(synced([], false))
      expect(syncConnection()).toBe('connected')

      announce(offline())
      await pass(30_000)

      expect([syncConnection(), isOnline()]).toEqual(['connecting', true])
    })
  })
  describe('while the store does not open', () => {
    const ACCESS = 'lock##IDB(grnyte-a.sqlite):/grnyte-a.sqlite##access'
    /** The measured hang: this tab's worker took the one lock and waits for the other, which the first tab holds. */
    const heldElsewhere = (name = ACCESS) =>
      Object.assign(locks, {
        held: [
          { clientId: 'worker', name: 'db-lock-grnyte-a.sqlite' },
          { clientId: 'other worker', name },
        ],
        pending: [{ clientId: 'worker', name }],
      })
    const start = async () => {
      const db = await import('./db.svelte')
      db.initPowerSync(session('a'), async () => 'token', settings)
      await settle()
      return db
    }
    const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms)
    let open: () => void
    beforeEach(() => {
      engine.ready = new Promise((resolve) => (open = resolve))
    })

    it.each([ACCESS, 'db-lock-grnyte-a.sqlite'])(
      'a tab that waits for %s is blocked after three seconds, until the store loads',
      async (name) => {
        Object.assign(locks, {
          held: [{ clientId: 'other worker', name }],
          pending: [{ clientId: 'worker', name }],
        })
        const { storeBlocked } = await start()
        await pass(2_900)
        expect(storeBlocked()).toBe(false)
        await pass(200)
        expect(storeBlocked()).toBe(true)

        open()
        await settle()
        expect(storeBlocked()).toBe(false)
      },
    )

    it('a slow open that waits for no other tab is never blocked', async () => {
      const { storeBlocked } = await start()
      await pass(20_000)

      expect(storeBlocked()).toBe(false)
    })

    it('waiting for a lock on another file is not blocked', async () => {
      heldElsewhere('lock##IDB(grnyte-b.sqlite):/grnyte-b.sqlite##access')
      const { storeBlocked } = await start()
      await pass(20_000)

      expect(storeBlocked()).toBe(false)
    })

    it('one worker that both holds and waits is not blocked', async () => {
      Object.assign(locks, {
        held: [{ clientId: 'worker', name: 'db-lock-grnyte-a.sqlite' }],
        pending: [{ clientId: 'worker', name: 'db-lock-grnyte-a.sqlite' }],
      })
      const { storeBlocked } = await start()
      await pass(20_000)

      expect(storeBlocked()).toBe(false)
    })

    it('without the lock manager nothing is blocked, and nothing fails', async () => {
      heldElsewhere()
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
      const rejected = vi.fn()
      process.on('unhandledRejection', rejected)
      const { storeBlocked } = await start()
      await pass(20_000)
      process.off('unhandledRejection', rejected)

      expect(storeBlocked()).toBe(false)
      expect(rejected).not.toHaveBeenCalled()
    })

    it('after closing it is not blocked', async () => {
      stubIndexedDb(['grnyte-a.sqlite'])
      heldElsewhere()
      const { dropAccount, storeBlocked } = await start()
      await pass(5_000)
      expect(storeBlocked()).toBe(true)

      await dropAccount('a')
      await pass(5_000)

      expect(storeBlocked()).toBe(false)
    })
  })
})
