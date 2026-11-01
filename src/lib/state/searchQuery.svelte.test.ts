import { describe, expect, it } from 'vitest'
import { liveRouteFilter, setLiveRouteFilter } from './searchQuery.svelte'

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
