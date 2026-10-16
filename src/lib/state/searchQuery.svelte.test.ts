import { describe, expect, it } from 'vitest'
import { liveRouteFilter, matchingRoutes, setLiveRouteFilter, setMatchingRoutes } from './searchQuery.svelte'

describe('the shared route filter', () => {
  it('keeps only filter params, in a stable order', () => {
    setLiveRouteFilter(new URLSearchParams('tags=a&q=egg&minGrade=3&sort=name'))
    expect(liveRouteFilter().current.search).toBe('minGrade=3&tags=a')
    expect(liveRouteFilter().current.parsed.filter.minGrade).toBe(3)
  })

  it('keeps its reference for an equal filter in another order', () => {
    setLiveRouteFilter(new URLSearchParams('minGrade=3&tags=a'))
    const before = liveRouteFilter().current
    setLiveRouteFilter(new URLSearchParams('tags=a&minGrade=3'))
    expect(liveRouteFilter().current).toBe(before)
  })

  it('clears with an empty URL', () => {
    setLiveRouteFilter(new URLSearchParams('minGrade=3'))
    setLiveRouteFilter(new URLSearchParams())
    expect(liveRouteFilter().current.search).toBe('')
  })
})

describe('the matching routes', () => {
  it('is null without a filter, whatever rows are on hand', () => {
    setMatchingRoutes(false, [{ id: 1 }], { empty: false, kind: 'answered' })
    expect(matchingRoutes().current.ids).toBeNull()
  })

  it('is the kept ids with a filter, empty included', () => {
    setMatchingRoutes(true, [{ id: 1 }, { id: 4 }], { empty: false, kind: 'answered' })
    expect([...matchingRoutes().current.ids!]).toEqual([1, 4])
    setMatchingRoutes(true, [], { empty: true, kind: 'answered' })
    expect(matchingRoutes().current.ids?.size).toBe(0)
  })
})
