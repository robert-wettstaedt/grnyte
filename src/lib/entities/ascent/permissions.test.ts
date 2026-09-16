import { REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import { userRegion } from '../region/fixture'
import { canEditAscent, canLogAscent } from './permissions'

const ME = 7
const SOMEBODY_ELSE = 8

describe('canEditAscent', () => {
  it('lets the climber edit their own ascent', () => {
    expect(canEditAscent([userRegion(1, REGION_PERMISSION_READ)], ME, { createdBy: ME, regionFk: 1 })).toBe(true)
  })

  it('lets a region admin edit somebody else’s', () => {
    expect(
      canEditAscent([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_ADMIN)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('refuses a maintainer somebody else’s: EDIT is not ADMIN', () => {
    expect(
      canEditAscent([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(false)
  })

  it('refuses a signed-out viewer', () => {
    expect(canEditAscent([userRegion(1, REGION_PERMISSION_READ)], undefined, { createdBy: ME, regionFk: 1 })).toBe(
      false,
    )
  })

  it('does not carry ADMIN across regions', () => {
    expect(canEditAscent([userRegion(1, REGION_PERMISSION_ADMIN)], ME, { createdBy: SOMEBODY_ELSE, regionFk: 2 })).toBe(
      false,
    )
  })
})

describe('canLogAscent', () => {
  it('lets any region member log an ascent', () => {
    expect(canLogAscent([userRegion(1, REGION_PERMISSION_READ)], { regionFk: 1 })).toBe(true)
  })

  it('refuses somebody with no membership of the route’s region', () => {
    expect(canLogAscent([userRegion(2, REGION_PERMISSION_READ)], { regionFk: 1 })).toBe(false)
  })

  it('is not satisfied by EDIT without READ', () => {
    expect(canLogAscent([userRegion(1, REGION_PERMISSION_EDIT)], { regionFk: 1 })).toBe(false)
  })
})
