import { REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import { userRegion } from '../region/fixture'
import { canAddArea, canAddBlock, canAddParking, canDeleteArea, canDeleteParking, canEditArea } from './permissions'

const ME = 7
const SOMEBODY_ELSE = 8

const editor = [userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)]
const reader = [userRegion(1, REGION_PERMISSION_READ)]

/**
 * What may be added where is a question about the area's own type, not only about permissions: an
 * area nests in an area, a block in a sector, and parking hangs off a sector. `null` is an area
 * whose type was never set, which the two nesting checks accept and parking does not.
 */
describe('canAddArea', () => {
  it('lets an editor add an area inside an area, or inside an untyped one', () => {
    expect(canAddArea(editor, { regionFk: 1, type: 'area' })).toBe(true)
    expect(canAddArea(editor, { regionFk: 1, type: null })).toBe(true)
  })

  it('refuses an area inside a sector, which holds blocks instead', () => {
    expect(canAddArea(editor, { regionFk: 1, type: 'sector' })).toBe(false)
  })

  it('refuses a plain reader', () => {
    expect(canAddArea(reader, { regionFk: 1, type: 'area' })).toBe(false)
  })
})

describe('canAddBlock', () => {
  it('lets an editor add a block inside a sector, or inside an untyped area', () => {
    expect(canAddBlock(editor, { regionFk: 1, type: 'sector' })).toBe(true)
    expect(canAddBlock(editor, { regionFk: 1, type: null })).toBe(true)
  })

  it('refuses a block inside an area, which holds areas instead', () => {
    expect(canAddBlock(editor, { regionFk: 1, type: 'area' })).toBe(false)
  })

  it('refuses a plain reader', () => {
    expect(canAddBlock(reader, { regionFk: 1, type: 'sector' })).toBe(false)
  })
})

describe('canAddParking', () => {
  it('lets an editor add parking to a sector', () => {
    expect(canAddParking(editor, { regionFk: 1, type: 'sector' })).toBe(true)
  })

  it('refuses an untyped area, unlike the two nesting checks', () => {
    expect(canAddParking(editor, { regionFk: 1, type: null })).toBe(false)
  })

  it('refuses a plain reader', () => {
    expect(canAddParking(reader, { regionFk: 1, type: 'sector' })).toBe(false)
  })
})

describe('canEditArea', () => {
  it('lets an editor edit an area in their region', () => {
    expect(canEditArea(editor, { regionFk: 1, type: 'area' })).toBe(true)
  })

  it('refuses a plain reader', () => {
    expect(canEditArea(reader, { regionFk: 1, type: 'area' })).toBe(false)
  })

  it('does not carry EDIT across regions', () => {
    expect(canEditArea(editor, { regionFk: 2, type: 'area' })).toBe(false)
  })
})

/** Unlike `canDeleteArea` below, no own-created grant: removing parking needs region DELETE. */
describe('canDeleteParking', () => {
  it('lets a region DELETE holder remove parking', () => {
    expect(canDeleteParking([userRegion(1, REGION_PERMISSION_DELETE)], { regionFk: 1 })).toBe(true)
  })

  it('refuses an editor', () => {
    expect(canDeleteParking(editor, { regionFk: 1 })).toBe(false)
  })

  it('does not carry DELETE across regions', () => {
    expect(canDeleteParking([userRegion(1, REGION_PERMISSION_DELETE)], { regionFk: 2 })).toBe(false)
  })
})

/**
 * `canDeleteArea` is DELETE, or an EDITor removing what they themselves created (the v1
 * capability restored in the audit). These pin that the own-created path needs BOTH edit AND
 * authorship AND the same region, so it can neither be dropped again nor widened by accident.
 */
describe('canDeleteArea', () => {
  it('lets a region DELETE holder remove anyone’s area', () => {
    expect(
      canDeleteArea([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_DELETE)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('lets an editor remove an area they created', () => {
    expect(
      canDeleteArea([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: ME,
        regionFk: 1,
      }),
    ).toBe(true)
  })

  it('does not let an editor remove an area somebody else created', () => {
    expect(
      canDeleteArea([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: SOMEBODY_ELSE,
        regionFk: 1,
      }),
    ).toBe(false)
  })

  it('does not carry the own-created grant across regions', () => {
    // Editor of region 1 created this area, but it lives in region 2 where they have no edit.
    expect(
      canDeleteArea([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, {
        createdBy: ME,
        regionFk: 2,
      }),
    ).toBe(false)
  })

  it('refuses a plain reader even of their own area', () => {
    expect(canDeleteArea([userRegion(1, REGION_PERMISSION_READ)], ME, { createdBy: ME, regionFk: 1 })).toBe(false)
  })

  it('does not match a null author against a null userId', () => {
    // createdBy defaults to undefined; userId undefined must not sneak past as "equal".
    expect(canDeleteArea([userRegion(1, REGION_PERMISSION_EDIT)], undefined, { regionFk: 1 })).toBe(false)
  })
})
