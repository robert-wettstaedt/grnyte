import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The engine is the one external dependency faked: a database records the file it opened.
vi.mock('$app/environment', () => ({ browser: true, dev: true }))
vi.mock('@powersync/web', async (original) => ({
  ...(await original<object>()),
  PowerSyncDatabase: class {
    currentStatus = { hasSynced: false, statusForPriority: () => undefined }
    constructor(readonly options: { database: { dbFilename: string } }) {}
    connect = () => Promise.resolve()
    disconnectAndClear = () => Promise.resolve()
    getAll = async () => []
    onChange = () => () => {}
    registerListener = () => () => {}
    waitForReady = () => Promise.resolve()
  },
}))
const opened = vi.hoisted(() => [] as { database: { options: { database: { dbFilename: string } } }; table: unknown }[])
// What each table was asked to load and to let go of, as PowerSync's on-demand sync receives it.
const asked = vi.hoisted(() => [] as { where?: unknown }[])
const released = vi.hoisted(() => [] as unknown[])
vi.mock('@tanstack/powersync-db-collection', () => ({
  powerSyncCollectionOptions: (options: (typeof opened)[number]) => {
    opened.push(options)
    return {
      getKey: (row: { id: string }) => row.id,
      id: String(opened.length),
      sync: {
        sync: ({ markReady }: { markReady: () => void }) => {
          markReady()
          return {
            loadSubset: (subset: { where?: unknown }) => {
              asked.push(subset)
              return Promise.resolve()
            },
            unloadSubset: (subset: unknown) => void released.push(subset),
          }
        },
      },
      syncMode: 'on-demand' as const,
    }
  },
}))

const session = (id: string) => ({ access_token: `token-${id}`, user: { id } }) as Session
const settings = { endpoint: 'https://sync.example', upload: async () => {} }

describe('collections', () => {
  beforeEach(() => {
    vi.resetModules()
    opened.length = 0
    asked.length = 0
    released.length = 0
  })

  it('opens every synced table on the signed-in account file, once', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { collections } = await import('./collections')
    const { appSchema } = await import('./schema')

    initPowerSync(session('a'), async () => 'token', settings)
    const first = collections()

    expect(Object.keys(first).sort()).toEqual(Object.keys(appSchema.props).sort())
    expect(new Set(opened.map((options) => options.database.options.database.dbFilename))).toEqual(
      new Set(['grnyte-a.sqlite']),
    )
    expect(collections()).toBe(first)
  })

  it('rebuilds them on the new account file when the account changes', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { collections } = await import('./collections')

    initPowerSync(session('a'), async () => 'token', settings)
    const first = collections()
    opened.length = 0
    initPowerSync(session('b'), async () => 'token', settings)
    const second = collections()

    expect(second).not.toBe(first)
    expect(new Set(opened.map((options) => options.database.options.database.dbFilename))).toEqual(
      new Set(['grnyte-b.sqlite']),
    )
  })

  // The sync merges what its readers ask for with `or()`, and a reader with no filter compiles to NULL there:
  // two of them, or one beside a filtered reader, would load nothing or only the filtered rows.
  it('asks a table for its rows with a filter that holds, for every reader with none', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { collections } = await import('./collections')
    const { createLiveQueryCollection } = await import('@tanstack/db')

    initPowerSync(session('a'), async () => 'token', settings)
    const table = collections().content_reports
    const reads = [0, 1].map(() => createLiveQueryCollection({ query: (q) => q.from({ r: table }), startSync: true }))
    await Promise.all(reads.map((read) => read.preload()))

    expect(asked.length).toBe(2)
    expect(asked.map((subset) => subset.where)).not.toContain(undefined)
  })

  it('lets go of the same subset it asked for', async () => {
    const { initPowerSync } = await import('./db.svelte')
    const { collections } = await import('./collections')
    const { createLiveQueryCollection } = await import('@tanstack/db')

    initPowerSync(session('a'), async () => 'token', settings)
    const read = createLiveQueryCollection({
      query: (q) => q.from({ r: collections().content_reports }),
      startSync: true,
    })
    await read.preload()
    await read.cleanup()

    expect(released).toEqual(asked)
  })
})
