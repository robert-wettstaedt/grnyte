import { REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { describe, expect, it } from 'vitest'
import type { UserRegion } from './dto'
import { canEditRegion, isLastAdmin } from './permissions'

const region = (regionFk: number, ...permissions: UserRegion['permissions']): UserRegion => ({
  name: `region ${regionFk}`,
  permissions,
  regionFk,
  role: 'region_user',
  settings: undefined,
})

const ADMIN_OF_1 = [region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT, REGION_PERMISSION_ADMIN)]
const MAINTAINER_OF_1 = [region(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)]

describe('canEditRegion', () => {
  it('lets a region admin administer their own region', () => {
    expect(canEditRegion(ADMIN_OF_1, 1)).toBe(true)
  })

  it('does not let a region admin administer a different region', () => {
    expect(canEditRegion(ADMIN_OF_1, 2)).toBe(false)
  })

  it('refuses a maintainer: region.edit is a content permission, not an administrative one', () => {
    expect(canEditRegion(MAINTAINER_OF_1, 1)).toBe(false)
  })

  it('refuses a plain member', () => {
    expect(canEditRegion([region(1, REGION_PERMISSION_READ)], 1)).toBe(false)
  })

  it('refuses somebody with no membership at all', () => {
    expect(canEditRegion([], 1)).toBe(false)
  })

  it('takes membership only, so an app admin gets nothing extra', () => {
    // `app.admin` is not a superuser: it carries no region permission, `authorize_in_region`
    // never reads the app role, and Zero scopes sync on `region_members`. The app.admin RLS
    // policies on `regions` / `region_members` make app admins a database-level back office,
    // and this asserts that none of that leaks into an in-app permission.
    const appAdminMaintainer = MAINTAINER_OF_1

    expect(canEditRegion(appAdminMaintainer, 1)).toBe(false)
    expect(canEditRegion(appAdminMaintainer, 99)).toBe(false)
  })
})

describe('isLastAdmin', () => {
  it('refuses the sole admin: demoting, removing or leaving would orphan the region', () => {
    expect(isLastAdmin([7], 7)).toBe(true)
  })

  it('allows one of two admins to go', () => {
    expect(isLastAdmin([7, 8], 7)).toBe(false)
  })

  it('allows a member who is not an admin to go, however few admins there are', () => {
    expect(isLastAdmin([7], 9)).toBe(false)
    expect(isLastAdmin([], 9)).toBe(false)
  })

  it('refuses nobody when the region already has no admin: there is nothing left to lose', () => {
    // Reachable through the database (an app admin can delete the last membership directly),
    // and blocking every departure would trap the remaining members.
    expect(isLastAdmin([], 7)).toBe(false)
  })
})
