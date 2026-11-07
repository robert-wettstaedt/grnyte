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
    registerListener = () => () => {}
    waitForReady = () => Promise.resolve()
  },
}))
const opened = vi.hoisted(() => [] as { database: { options: { database: { dbFilename: string } } }; table: unknown }[])
vi.mock('@tanstack/powersync-db-collection', () => ({
  powerSyncCollectionOptions: (options: (typeof opened)[number]) => {
    opened.push(options)
    return { getKey: (row: { id: string }) => row.id, id: String(opened.length), sync: { sync: () => {} } }
  },
}))

const session = (id: string) => ({ access_token: `token-${id}`, user: { id } }) as Session
const settings = { endpoint: 'https://sync.example', only: false }

describe('collections', () => {
  beforeEach(() => {
    vi.resetModules()
    opened.length = 0
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
})
