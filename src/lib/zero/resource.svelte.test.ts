import { blockTree } from '$lib/entities/block/resources.svelte'
import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { pillSurface, quietly } from '$lib/state/pill.svelte'
import { BasicIndex, createCollection, type SyncConfig } from '@tanstack/db'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string }

// Reactive, so a stream confirming or the network dropping wakes the pill's effect as the real signals do.
const env = $state({ confirmed: false, everSynced: true, online: true })

vi.mock('$lib/state/online.svelte', async (original) => ({
  ...(await original<object>()),
  isOnline: () => env.online,
}))
vi.mock('$lib/powersync/db.svelte', async (original) => ({
  ...(await original<object>()),
  powerSyncStatus: () => ({ forStream: () => ({ subscription: { hasSynced: env.everSynced } }) }),
  streamConfirmed: () => env.confirmed,
}))
vi.mock('$lib/state/pill.svelte', async (original) => {
  const actual = await original<typeof import('$lib/state/pill.svelte')>()
  const surface = new actual.PillSurface()
  return { ...actual, pillSurface: () => surface }
})
vi.mock('$lib/powersync/collections', () => ({ collections: () => fake.collections }))

/** A synced table whose rows and readiness a test sets by hand, as PowerSync's collection would deliver them. */
function fakeTable(name: string) {
  let sync!: Parameters<SyncConfig<Row, string>['sync']>[0]
  const collection = createCollection<Row, string>({
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    getKey: (row) => row.id,
    id: `${name}-${crypto.randomUUID()}`,
    startSync: true,
    sync: { sync: (params) => void (sync = params) },
  })
  return {
    collection,
    ready: () => sync.markReady(),
    write: (rows: Row[]) => {
      sync.begin()
      for (const value of rows) sync.write({ type: 'insert', value })
      sync.commit()
    },
  }
}

function fakeTables() {
  const tables = new Map<string, ReturnType<typeof fakeTable>>()
  const table = (name: string) => tables.get(name) ?? tables.set(name, fakeTable(name)).get(name)!
  return {
    collections: new Proxy({}, { get: (_, name: string) => table(name).collection }) as ReturnType<typeof collections>,
    ready: () => tables.forEach((each) => each.ready()),
    seed: (rows: Record<string, Row[]>) => Object.entries(rows).forEach(([name, value]) => table(name).write(value)),
  }
}

let fake: ReturnType<typeof fakeTables>

// Text ids differ from the integer ids, and sort the other way, so a join or order on the wrong key shows.
const synced = {
  areas: [
    { id: 'a-10', name: 'Wall', nid: 10, parent_fk: 20, type: 'sector' },
    { id: 'a-20', name: 'Forest', nid: 20, parent_fk: null, type: 'area' },
  ],
  blocks: [
    { area_fk: 10, geolocation_fk: 5, id: 'b-1', name: 'Egg', nid: 1 },
    { area_fk: 10, geolocation_fk: null, id: 'b-2', name: 'Cube', nid: 2 },
  ],
  files: [{ id: 'f-1', path: 'topo.jpg' }],
  geolocations: [{ id: 'g-5', lat: 47.5, long: 11.25, nid: 5 }],
  routes: [
    { block_fk: 1, id: 'r-100', name: 'Hundred', nid: 100 },
    { block_fk: 1, id: 'r-99', name: 'Ninety-nine', nid: 99 },
  ],
  routes_to_tags: [
    { id: 't-1', route_fk: 99, tag_fk: 'SD' },
    { id: 't-2', route_fk: 99, tag_fk: 'defined' },
  ],
  topo_routes: [{ id: 'l-7', nid: 7, route_fk: 99, topo_fk: 3 }],
  topos: [{ block_fk: 1, file_fk: 'f-1', id: 't-3', nid: 3, order: 0 }],
}

describe('a PowerSync resource over faked TanStack collections', () => {
  let cleanup: () => void
  const id = $state({ current: 1 })
  let resource: ReturnType<typeof blockTree<unknown>>

  const build = (wrap: <T>(make: () => T) => T = (make) => make()) => {
    cleanup = $effect.root(() => {
      resource = wrap(() =>
        blockTree(
          () => id.current,
          (row) => row,
        ),
      )
    })
  }

  const phase = () => {
    flushSync()
    return resource.phase
  }

  // The live query reads its tables once they report ready; a microtask later its result is in.
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve))
    flushSync()
  }

  beforeEach(() => {
    Object.assign(env, { confirmed: false, everSynced: true, online: true })
    id.current = 1
    fake = fakeTables()
  })

  afterEach(() => cleanup())

  it('is loading while the tables have not been read', () => {
    build()
    expect(phase()).toEqual({ kind: 'loading' })
  })

  it('is arriving with rows on disk before this session confirms the stream', async () => {
    fake.seed(synced)
    build()
    fake.ready()
    await settle()
    expect(phase()).toEqual({ kind: 'arriving' })
  })

  it('is answered once the stream is confirmed', async () => {
    fake.seed(synced)
    build()
    fake.ready()
    env.confirmed = true
    await settle()
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
  })

  it('answers empty for a row the confirmed stream does not have', async () => {
    build()
    fake.ready()
    env.confirmed = true
    await settle()
    expect(phase()).toEqual({ empty: true, kind: 'answered' })
    expect(resource.data).toBeUndefined()
  })

  it('answers offline from disk once the stream ever synced', async () => {
    env.online = false
    fake.seed(synced)
    build()
    fake.ready()
    await settle()
    expect(phase()).toEqual({ empty: false, kind: 'answered' })
  })

  it('is unavailable offline when the stream never synced', async () => {
    env.online = false
    env.everSynced = false
    build()
    fake.ready()
    await settle()
    expect(phase()).toEqual({ excluded: false, kind: 'unavailable' })
  })

  it('keeps an answer when the confirmation drops, but only for the query that earned it', async () => {
    fake.seed(synced)
    build()
    fake.ready()
    env.confirmed = true
    await settle()
    expect(phase().kind).toBe('answered')

    env.confirmed = false
    expect(phase()).toEqual({ empty: false, kind: 'answered' })

    id.current = 2
    await settle()
    expect(phase()).toEqual({ kind: 'arriving' })
  })

  it('holds the pill while arriving, and lets go once answered', async () => {
    fake.seed(synced)
    build()
    fake.ready()
    await settle()
    expect(phase().kind).toBe('arriving')
    expect(pillSurface()?.content).toEqual({ kind: 'syncing' })

    env.confirmed = true
    expect(phase().kind).toBe('answered')
    expect(pillSurface()?.content).toBeUndefined()
  })

  it('never holds the pill when built quietly', async () => {
    fake.seed(synced)
    build(quietly)
    fake.ready()
    await settle()
    expect(phase().kind).toBe('arriving')
    expect(pillSurface()?.content).toBeUndefined()
  })

  it('builds no query at all while disabled', async () => {
    const query = vi.fn((q) => q.from({ b: fake.collections.blocks }))
    let on = $state(false)
    cleanup = $effect.root(() => {
      resource = psResource(query, [], (rows) => rows, 'guidebook', { enabled: () => on })
    })
    fake.ready()
    await settle()
    expect(query).not.toHaveBeenCalled()
    expect(resource.phase).toEqual({ kind: 'loading' })

    on = true
    flushSync()
    expect(query).toHaveBeenCalled()
  })

  it('runs the block tree builders: chain, pin, routes and tags by integer id, topos with photo and lines', async () => {
    fake.seed(synced)
    build()
    fake.ready()
    await settle()
    expect(resource.data).toMatchObject({
      area: { id: 10, name: 'Wall', parent: { id: 20, name: 'Forest' } },
      geolocation: { id: 5, lat: 47.5, long: 11.25 },
      id: 1,
      name: 'Egg',
      routes: [
        { id: 99, name: 'Ninety-nine', tags: [{ tagFk: 'defined' }, { tagFk: 'SD' }] },
        { id: 100, name: 'Hundred', tags: [] },
      ],
      topos: [{ file: { id: 'f-1', path: 'topo.jpg' }, id: 3, routes: [{ id: 7, routeFk: 99 }] }],
    })
  })
})
