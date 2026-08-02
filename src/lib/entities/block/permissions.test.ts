import { REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import type { UserRegion } from '../region/dto'
import { canDeleteBlock } from './permissions'

const region = (regionFk: number, ...permissions: UserRegion['permissions']): UserRegion => ({
  name: `region ${regionFk}`,
  permissions,
  regionFk,
  role: 'region_user',
  settings: undefined,
})

const ME = 7
const SOMEBODY_ELSE = 8

/** Same shape as `canDeleteArea`: DELETE, or an EDITor removing what they created (mirrors v1). */
describe('canDeleteBlock', () => {
  it('lets a region DELETE holder remove anyone’s block', () => {
    expect(
      canDeleteBlock([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_DELETE)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('lets an editor remove a block they created', () => {
    expect(
      canDeleteBlock([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, { createdBy: ME, regionFk: 1 }),
    ).toBe(true)
  })

  it('does not let an editor remove a block somebody else created', () => {
    expect(
      canDeleteBlock([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(false)
  })

  it('does not carry the own-created grant across regions', () => {
    expect(
      canDeleteBlock([region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, { createdBy: ME, regionFk: 2 }),
    ).toBe(false)
  })

  it('refuses a plain reader even of their own block', () => {
    expect(canDeleteBlock([region(1, REGION_PERMISSION_READ)], ME, { createdBy: ME, regionFk: 1 })).toBe(false)
  })
})
