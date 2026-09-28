/** `known` has two halves and both must move the fingerprint; the rest is what a form gets wrong. */
import { describe, expect, it } from 'vitest'
import { toDisplayName } from '../displayName'
import type { RouteDetail } from './dto'
import { routeEditSeed } from './editSeed'
import { routeListsFingerprint } from './fingerprint'

function detail(overrides: Partial<RouteDetail> = {}): RouteDetail {
  return {
    blockFk: 7,
    createdAt: undefined,
    createdBy: 1,
    description: 'Sit start, then the arete.',
    firstAscents: [{ name: 'Ada', userFk: 1 }],
    firstAscentYear: 2019,
    gradeFk: 11,
    id: 42,
    name: toDisplayName('Karma'),
    rating: 3,
    rawGradeFk: 11,
    rawName: 'Karma',
    rawRating: 3,
    regionFk: 2,
    tags: ['benchmark', 'defined'],
    ...overrides,
  }
}

describe('routeEditSeed', () => {
  it('measures `known` over the lists it was seeded from', () => {
    const route = detail()

    expect(routeEditSeed(route).known).toBe(routeListsFingerprint(route.tags, route.firstAscents))
  })

  it('carries a tag change into `known`, so a stale form cannot pass the handler guard', () => {
    const loaded = routeEditSeed(detail({ tags: ['benchmark', 'defined'] }))
    const moved = routeEditSeed(detail({ tags: ['benchmark', 'high'] }))

    expect(loaded.known).not.toBe(moved.known)
  })

  it('carries a first ascensionist change into `known` too, the other half of the guard', () => {
    const loaded = routeEditSeed(detail({ firstAscents: [{ name: 'Ada', userFk: 1 }] }))
    const moved = routeEditSeed(detail({ firstAscents: [{ name: 'Bea', userFk: 2 }] }))

    expect(loaded.known).not.toBe(moved.known)
  })

  it('seeds the stored name, not the display fallback, so a nameless route stays nameless', () => {
    expect(routeEditSeed(detail({ name: toDisplayName(''), rawName: '' })).name).toBe('')
  })

  it('seeds the description as stored', () => {
    expect(routeEditSeed(detail({ description: 'Traverse in from the left.' })).description).toBe(
      'Traverse in from the left.',
    )
  })

  it('posts an absent first ascent year as empty', () => {
    expect(routeEditSeed(detail({ firstAscentYear: undefined })).firstAscentYear).toBe('')
  })

  it('keeps a year that is present', () => {
    expect(routeEditSeed(detail({ firstAscentYear: 1998 })).firstAscentYear).toBe('1998')
  })

  it('sends the block and route ids as strings, which is what the form inputs hold', () => {
    expect(routeEditSeed(detail({ blockFk: 3, id: 99 }))).toMatchObject({ blockId: '3', id: '99' })
  })
})
