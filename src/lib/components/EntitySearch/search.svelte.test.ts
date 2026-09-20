import type { RouteListRow } from '$lib/entities/route/mapper'
import { m } from '$lib/paraglide/messages'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debouncedQuery, entityMappers, searchReady } from './search.svelte'

// The picker lists must never print a blank row: names come from the entity mappers,
// which own the "unnamed route" and "Block <order>" fallbacks.
describe('entityMappers', () => {
  const map = entityMappers()

  const blockRow = { area: undefined, id: 7, name: '', order: 0, regionFk: 2 }

  const routeRow = {
    block: { area: undefined, id: 5, name: '', order: 2 },
    blockFk: 5,
    createdAt: null,
    createdBy: 1,
    description: null,
    firstAscents: [],
    firstAscentYear: null,
    gradeFk: null,
    id: 9,
    name: '',
    rating: null,
    regionFk: 2,
    tags: [],
    topoRoutes: [],
    userGradeFk: null,
    userRating: null,
  } as unknown as RouteListRow

  it('labels a nameless route with the unnamed placeholder', () => {
    expect(map.routes(routeRow).label).toBe(m.common_unnamed())
  })

  it('labels a nameless block by its order', () => {
    expect(map.blocks(blockRow).label).toBe(`${m.common_block()} 1`)
  })

  it('uses the same block fallback in a route crumb', () => {
    expect(map.routes(routeRow).context).toEqual([`${m.common_block()} 3`])
  })
})

describe('searchReady', () => {
  it('does not register while the debounce is still behind a typed term', () => {
    expect(searchReady(true, 'b', '')).toBe(false)
  })

  it('registers once the debounce has caught up', () => {
    expect(searchReady(true, 'boulder', 'boulder')).toBe(true)
  })

  // The mention picker opens with an empty box on purpose and lists entities before anything is
  // typed. That is a real empty search, not a debounce lagging behind one.
  it('registers an empty search the caller actually asked for', () => {
    expect(searchReady(true, '', '')).toBe(true)
  })

  it('registers a refinement off the previous term rather than stalling', () => {
    expect(searchReady(true, 'boul', 'b')).toBe(true)
  })

  it('never registers while closed', () => {
    expect(searchReady(false, '', '')).toBe(false)
    expect(searchReady(false, 'boulder', 'boulder')).toBe(false)
  })
})

// The term is a query argument, so an undebounced keystroke is its own server registration.
// These pin the two halves that decide that: typing waits, clearing does not.
describe('debouncedQuery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const harness = (initial: string) => {
    let typed = $state(initial)
    let read: () => string = () => ''

    const stop = $effect.root(() => {
      read = debouncedQuery(() => typed, 200)
    })

    flushSync()

    return {
      settled: () => read(),
      stop,
      type: (next: string) => {
        typed = next
        flushSync()
      },
    }
  }

  it('withholds a typed term until it stops changing', () => {
    const h = harness('')
    h.type('a')
    expect(h.settled()).toBe('')

    vi.advanceTimersByTime(199)
    flushSync()
    expect(h.settled()).toBe('')

    vi.advanceTimersByTime(1)
    flushSync()
    expect(h.settled()).toBe('a')
    h.stop()
  })

  it('never publishes an intermediate keystroke', () => {
    const h = harness('')
    h.type('a')
    vi.advanceTimersByTime(100)
    h.type('ab')
    vi.advanceTimersByTime(100)
    h.type('abc')
    expect(h.settled()).toBe('')

    vi.advanceTimersByTime(200)
    flushSync()
    expect(h.settled()).toBe('abc')
    h.stop()
  })

  it('applies a clear at once, so a reopened picker cannot register the previous term', () => {
    const h = harness('')
    h.type('abc')
    vi.advanceTimersByTime(200)
    flushSync()
    expect(h.settled()).toBe('abc')

    h.type('')
    expect(h.settled()).toBe('')
    h.stop()
  })
})
