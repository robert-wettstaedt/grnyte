import { REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import type { UserRegion } from '../region/dto'
import { canDeleteArea } from './permissions'

const region = (regionFk: number, ...permissions: UserRegion['permissions']): UserRegion => ({
  name: `region ${regionFk}`,
  permissions,
  regionFk,
  role: 'region_user',
  settings: undefined,
})

const ME = 7
const SOMEBODY_ELSE = 8

/**
 * `canDeleteArea` is DELETE, or an EDITor removing what they themselves created (the v1
 * capability restored in the audit). These pin that the own-created path needs BOTH edit AND
 * authorship AND the same region - so it can neither be dropped again nor widened by accident.
 */
describe('canDeleteArea', () => {
  it('lets a region DELETE holder remove anyone’s area', () => {
    expect(
      canDeleteArea([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_DELETE)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('lets an editor remove an area they created', () => {
    expect(
      canDeleteArea([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, { createdBy: ME, regionFk: 1 }),
    ).toBe(true)
  })

  it('does not let an editor remove an area somebody else created', () => {
    expect(
      canDeleteArea([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(false)
  })

  it('does not carry the own-created grant across regions', () => {
    // Editor of region 1 created this area, but it lives in region 2 where they have no edit.
    expect(
      canDeleteArea([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, { createdBy: ME, regionFk: 2 }),
    ).toBe(false)
  })

  it('refuses a plain reader even of their own area', () => {
    expect(canDeleteArea([region(1, REGION_PERMISSION_READ)], ME, { createdBy: ME, regionFk: 1 })).toBe(false)
  })

  it('does not match a null author against a null userId', () => {
    // createdBy defaults to undefined; userId undefined must not sneak past as "equal".
    expect(canDeleteArea([region(1, REGION_PERMISSION_EDIT)], undefined, { regionFk: 1 })).toBe(false)
  })
})
