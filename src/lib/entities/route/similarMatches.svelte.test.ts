import { ROUTE_MAP_SQL, ROUTES_BY_ID_SQL } from '$lib/powersync/sql'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { similarRoutes } from './similarMatches.svelte'

type Args = unknown[]

const client = vi.hoisted(() => {
  const state = {
    names: {} as Record<string, string>,
    // A watched statement re-answers whenever the rows it reads change, unless its name is loading.
    query: ({ parameters, sql }: { parameters: Args; sql: string }) => ({
      watch() {
        const name = state.names[sql] ?? sql
        state.requests.push({ args: parameters, name })
        return {
          close: async () => {},
          registerListener: ({ onData }: { onData: (rows: unknown[]) => void }) =>
            $effect.root(() => {
              $effect(() => {
                if (name !== region.loading) onData(state.rows[name]?.(parameters) ?? [])
              })
            }),
        }
      },
    }),
    requests: [] as { args: Args; name: string }[],
    rows: {} as Record<string, (args: Args) => unknown[]>,
  }
  return state
})

// PowerSync's database is the one thing faked: the real resources, statements' callers, mappers and matcher run.
vi.mock('$lib/powersync/db.svelte', () => ({
  getPowerSync: () => ({ query: client.query }),
  powerSyncStatus: () => ({ forStream: () => ({ subscription: { hasSynced: true } }) }),
  streamConfirmed: () => true,
}))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
vi.mock('$lib/state/sync.svelte', () => ({ lastSyncedAt: () => null, localStoreLoaded: () => true }))

const current = $state({ block: { areaFk: 10, id: 1, regionFk: 2 } })

const input = $state({ focused: false, name: '' })
const region = $state({
  loading: undefined as string | undefined,
  names: [] as { id: number; name: string }[],
  pending: [] as number[],
})

let cleanup: () => void
let list: ReturnType<typeof similarRoutes>

const fullRow = ({ id, name }: { id: number; name: string }) => ({
  block: null,
  block_fk: 1,
  first_ascents: '[]',
  name,
  nid: id,
  region_fk: 2,
  tags: '[]',
  topo_routes: '[]',
})

const type = (name: string) => {
  input.name = name
  flushSync()
  vi.advanceTimersByTime(200)
  flushSync()
}

const shownIds = () => list.rows.map((row) => row.route.id)

beforeEach(() => {
  vi.useFakeTimers()
  client.requests.length = 0
  current.block = { areaFk: 10, id: 1, regionFk: 2 }
  input.focused = false
  input.name = ''
  region.pending = []
  region.names = [
    { id: 7, name: 'Karma' },
    { id: 8, name: 'Zecke' },
  ]
  client.names = { [ROUTE_MAP_SQL]: 'listRoutesForMap', [ROUTES_BY_ID_SQL]: 'listRoutes' }
  client.rows = {
    listRoutes: ([ids]) =>
      region.names
        .filter(({ id }) => (JSON.parse(ids as string) as number[]).includes(id) && !region.pending.includes(id))
        .map(fullRow),
    listRoutesForMap: () => region.names.map((route) => ({ area_ids: '^10$', block_fk: 1, ...route })),
  }
  region.loading = undefined
  cleanup = $effect.root(() => {
    list = similarRoutes({ block: () => current.block, focused: () => input.focused, name: () => input.name })
    // What the list component does: reading the rows is what subscribes.
    $effect(() => void list.rows)
  })
  flushSync()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('reads nothing until the name field first has focus, then this region', () => {
  expect(client.requests).toEqual([])

  input.focused = true
  flushSync()

  expect(client.requests).toEqual([{ args: [2, ...Array(8).fill(null)], name: 'listRoutesForMap' }])
})

it('keeps its region watch when the block is replaced by an equal one', () => {
  input.focused = true
  flushSync()
  current.block = { ...current.block }
  flushSync()

  expect(client.requests.filter(({ name }) => name === 'listRoutesForMap')).toHaveLength(1)
})

it('lists a matching route once the typing settles', () => {
  input.focused = true
  flushSync()

  input.name = 'Karma'
  flushSync()
  expect(shownIds()).toEqual([])

  vi.advanceTimersByTime(200)
  flushSync()

  expect(list.rows).toMatchObject([{ kind: 'exact', place: 'block', route: { id: 7, name: 'Karma' } }])
})

it('asks for display rows once while the top ids stay the same', () => {
  input.focused = true
  type('Karma')
  type('Karmaa')
  type('Karma')

  expect(client.requests.filter(({ name }) => name === 'listRoutes')).toEqual([{ args: ['[7]'], name: 'listRoutes' }])
})

it('holds the list after focus leaves, and catches up when it returns', () => {
  input.focused = true
  type('Karma')
  input.focused = false
  flushSync()

  region.names = [...region.names, { id: 9, name: 'Karma' }]
  flushSync()
  expect(shownIds()).toEqual([7])

  input.focused = true
  flushSync()
  expect(shownIds()).toEqual([7, 9])
})

it('lands the name typed under focus when it settles after focus has left, then holds', () => {
  input.focused = true
  type('Karma')
  input.name = 'Zecke'
  flushSync()
  input.focused = false
  flushSync()
  expect(shownIds()).toEqual([7])

  vi.advanceTimersByTime(200)
  flushSync()
  expect(shownIds()).toEqual([8])

  region.names = [...region.names, { id: 9, name: 'Zecke' }]
  flushSync()
  expect(shownIds()).toEqual([8])
})

it('keeps the list when focus returns with the same name', () => {
  input.focused = true
  type('Karma')
  input.focused = false
  flushSync()
  input.focused = true
  flushSync()

  expect(shownIds()).toEqual([7])
})

it('keeps the current rows until the next ones have loaded', () => {
  input.focused = true
  type('Karma')

  region.loading = 'listRoutes'
  region.pending = [8]
  type('Zecke')
  expect(shownIds()).toEqual([7])

  // The route row alone is not the whole row: its relations may still be on their way.
  region.pending = []
  flushSync()
  expect(shownIds()).toEqual([7])

  region.loading = undefined
  flushSync()
  expect(shownIds()).toEqual([8])
})

it('closes at once when the name is cleared', () => {
  input.focused = true
  type('Karma')

  input.name = ''
  flushSync()

  expect(shownIds()).toEqual([])
})

it('closes when nothing matches any more', () => {
  input.focused = true
  type('Karma')
  type('Qqqqq')

  expect(shownIds()).toEqual([])
})

it('leaves out a match whose route no longer loads', () => {
  input.focused = true
  type('Karma')

  region.pending = [9]
  region.names = [...region.names, { id: 9, name: 'Karma' }]
  flushSync()

  expect(shownIds()).toEqual([7])
})
