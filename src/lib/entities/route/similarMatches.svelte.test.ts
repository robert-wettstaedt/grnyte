import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { similarRoutes } from './similarMatches.svelte'

type Args = Record<string, unknown>

const client = vi.hoisted(() => {
  const state = {
    createQuery: (request: { args: Args; query: { queryName: string } }, enabled: boolean) => {
      const name = request.query.queryName
      if (enabled) state.requests.push({ args: request.args, name })
      return {
        get data() {
          return enabled ? (state.rows[name]?.(request.args) ?? []) : []
        },
        get details() {
          return { type: enabled && name !== region.loading ? ('complete' as const) : ('unknown' as const) }
        },
        view: { ensureSubscribed() {} },
      }
    },
    requests: [] as { args: Args; name: string }[],
    rows: {} as Record<string, (args: Args) => unknown[]>,
  }
  return state
})

// Zero's client is the one thing faked: the real resources, mappers and matcher all run.
vi.mock('$lib/zero/z.svelte', () => ({ getZ: () => ({ createQuery: client.createQuery }) }))
vi.mock('$lib/zero/ttlSource.svelte', () => ({ ttlSource: () => ({ createQuery: client.createQuery }) }))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => true }))
vi.mock('$lib/state/device.svelte', () => ({ isFieldDevice: () => false }))
vi.mock('$lib/state/sync.svelte', () => ({ lastSyncedAt: () => null, localStoreLoaded: () => true }))

const block = { areaFk: 10, id: 1, regionFk: 2 }

const input = $state({ focused: false, name: '' })
const region = $state({
  loading: undefined as string | undefined,
  names: [] as { id: number; name: string }[],
  pending: [] as number[],
})

let cleanup: () => void
let list: ReturnType<typeof similarRoutes>

const fullRow = (route: { id: number; name: string }) => ({ blockFk: 1, regionFk: 2, tags: [], ...route })

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
  input.focused = false
  input.name = ''
  region.pending = []
  region.names = [
    { id: 7, name: 'Karma' },
    { id: 8, name: 'Zecke' },
  ]
  client.rows = {
    listRoutes: (args) =>
      region.names
        .filter(({ id }) => (args.routeId as number[]).includes(id) && !region.pending.includes(id))
        .map(fullRow),
    listRoutesForMap: () => region.names.map((route) => ({ areaIds: '^10$', blockFk: 1, ...route })),
  }
  region.loading = undefined
  cleanup = $effect.root(() => {
    list = similarRoutes({ block: () => block, focused: () => input.focused, name: () => input.name })
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

  expect(client.requests).toEqual([{ args: { regionFk: 2 }, name: 'listRoutesForMap' }])
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

  expect(client.requests.filter(({ name }) => name === 'listRoutes')).toEqual([
    { args: { routeId: [7] }, name: 'listRoutes' },
  ])
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
