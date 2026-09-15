import { REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import { userRegion } from '../region/fixture'
import { canAddRoute, canDeleteRoute, canEditRoute } from './permissions'

const ME = 7
const SOMEBODY_ELSE = 8

describe('canAddRoute', () => {
  it('lets an editor add a route to a block in their region', () => {
    expect(canAddRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], { regionFk: 1 })).toBe(true)
  })

  it('refuses a plain reader', () => {
    expect(canAddRoute([userRegion(1, REGION_PERMISSION_READ)], { regionFk: 1 })).toBe(false)
  })

  it('does not carry EDIT across regions', () => {
    expect(canAddRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], { regionFk: 2 })).toBe(false)
  })
})

/** READ is deliberately not enough: the routes UPDATE policy grants it for ascent grade folding. */
describe('canEditRoute', () => {
  it('lets an editor edit a route in their region', () => {
    expect(canEditRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], { regionFk: 1 })).toBe(true)
  })

  it('refuses a plain reader', () => {
    expect(canEditRoute([userRegion(1, REGION_PERMISSION_READ)], { regionFk: 1 })).toBe(false)
  })

  it('refuses someone with no membership of the route’s region', () => {
    expect(canEditRoute([userRegion(2, REGION_PERMISSION_EDIT)], { regionFk: 1 })).toBe(false)
  })
})

/** Same shape as `canDeleteArea` and `canDeleteBlock`: DELETE, or an EDITor removing what they
 *  created (mirrors v1). */
describe('canDeleteRoute', () => {
  it('lets a region DELETE holder remove anyone’s route', () => {
    expect(
      canDeleteRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_DELETE)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('lets an editor remove a route they created', () => {
    expect(
      canDeleteRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: ME,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('does not let an editor remove a route somebody else created', () => {
    expect(
      canDeleteRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(false)
  })

  it('does not carry the own-created grant across regions', () => {
    expect(
      canDeleteRoute([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: ME,
        regionFk: 2,
      }),
    ).toBe(false)
  })

  it('refuses a plain reader even of their own route', () => {
    expect(canDeleteRoute([userRegion(1, REGION_PERMISSION_READ)], ME, { createdBy: ME, regionFk: 1 })).toBe(false)
  })
})
