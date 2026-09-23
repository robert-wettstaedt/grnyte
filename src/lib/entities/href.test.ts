/**
 * Final strings, not a spy on `resolve`. A mocked call would pass while the route pattern was
 * wrong, which is the only mistake this module can make.
 */
import { describe, expect, it } from 'vitest'
import { entityHref, type EntityKind } from './href'

// A `Record` keyed by the union, so a kind added without a case here does not compile.
const EXPECTED: Record<EntityKind, string> = {
  areas: '/areas/5',
  ascents: '/ascents/5',
  blocks: '/blocks/5',
  regions: '/regions/5',
  routes: '/routes/5',
  users: '/users/5',
}

describe('entityHref', () => {
  for (const [kind, expected] of Object.entries(EXPECTED) as [EntityKind, string][]) {
    it(`links a ${kind} row to its detail screen`, () => {
      expect(entityHref(kind, 5)).toBe(expected)
    })
  }

  it('gives every kind its own screen, so no two share a route', () => {
    const hrefs = (Object.keys(EXPECTED) as EntityKind[]).map((kind) => entityHref(kind, 5))

    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('takes the id as a number, because every id in this app is one', () => {
    expect(entityHref('routes', 22564)).toBe('/routes/22564')
  })
})
