import { REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import { userRegion } from '../region/fixture'
import { canEditTopo } from './permissions'

describe('canEditTopo', () => {
  it('lets an editor into the topo editor', () => {
    expect(canEditTopo([userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)], { regionFk: 1 })).toBe(true)
  })

  it('refuses a plain reader', () => {
    expect(canEditTopo([userRegion(1, REGION_PERMISSION_READ)], { regionFk: 1 })).toBe(false)
  })

  it('does not carry EDIT across regions', () => {
    expect(canEditTopo([userRegion(1, REGION_PERMISSION_EDIT)], { regionFk: 2 })).toBe(false)
  })
})
