import {
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import { describe, expect, it } from 'vitest'
import { userRegion } from '../region/fixture'
import { canDeleteFile, canEditFile } from './permissions'

const ME = 7
const SOMEBODY_ELSE = 8

/** A file attached to somebody's ascent, in region 1. `undefined`, as the DTO spells it, for a file
 *  that is not ascent media at all. */
const file = (ascentCreatedBy: number | undefined, regionFk = 1) => ({ ascentCreatedBy, regionFk })

/**
 * Both predicates are DELIBERATELY STRICTER than the files RLS they shadow, because publishing an
 * ascent file exposes the whole ascent. The maintainer cases below are what that divergence means
 * in practice, so a later "align with RLS" cannot quietly widen them.
 */
describe('canEditFile', () => {
  it('lets the ascent owner edit their own media, on READ alone', () => {
    expect(canEditFile([userRegion(1, REGION_PERMISSION_READ)], ME, file(ME))).toBe(true)
  })

  it('lets a region admin edit somebody else’s ascent media', () => {
    expect(canEditFile([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_ADMIN)], ME, file(SOMEBODY_ELSE))).toBe(
      true,
    )
  })

  it('refuses a maintainer somebody else’s ascent media, which the RLS would allow', () => {
    expect(canEditFile([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, file(SOMEBODY_ELSE))).toBe(
      false,
    )
  })

  it('needs only EDIT for a file that is not ascent media', () => {
    expect(canEditFile([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, file(undefined))).toBe(true)
    expect(canEditFile([userRegion(1, REGION_PERMISSION_READ)], ME, file(undefined))).toBe(false)
  })

  it('does not carry the owner grant into a region the owner is not in', () => {
    expect(canEditFile([userRegion(1, REGION_PERMISSION_READ)], ME, file(ME, 2))).toBe(false)
  })
})

describe('canDeleteFile', () => {
  it('lets a region DELETE holder remove anyone’s media', () => {
    expect(
      canDeleteFile([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_DELETE)], ME, file(SOMEBODY_ELSE)),
    ).toBe(true)
  })

  it('lets the ascent owner remove their own media, on READ alone', () => {
    expect(canDeleteFile([userRegion(1, REGION_PERMISSION_READ)], ME, file(ME))).toBe(true)
  })

  it('refuses a maintainer somebody else’s ascent media, which the RLS would allow', () => {
    expect(
      canDeleteFile([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], ME, file(SOMEBODY_ELSE)),
    ).toBe(false)
  })

  it('refuses a signed-out viewer a file with no ascent author', () => {
    // Both are `undefined`, so without the userId guard this file reads as the viewer's own.
    expect(canDeleteFile([userRegion(1, REGION_PERMISSION_READ)], undefined, file(undefined))).toBe(false)
  })
})
