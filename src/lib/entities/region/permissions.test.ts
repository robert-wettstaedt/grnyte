import {
  APP_PERMISSION_ADMIN,
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import { describe, expect, it } from 'vitest'
import type { UserRegion } from './dto'
import { userRegion } from './fixture'
import { canEditRegion } from './permissions'

const ADMIN_OF_1 = [userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT, REGION_PERMISSION_ADMIN)]
const MAINTAINER_OF_1 = [userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT)]

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
    expect(canEditRegion([userRegion(1, REGION_PERMISSION_READ)], 1)).toBe(false)
  })

  it('refuses somebody with no membership at all', () => {
    expect(canEditRegion([], 1)).toBe(false)
  })

  it('takes membership only, so an app admin gets nothing extra', () => {
    // `app.admin` is not a superuser: it carries no region permission, `authorize_in_region`
    // never reads the app role, and Zero scopes sync on `region_members`. The app.admin RLS
    // policies on `regions` / `region_members` make app admins a database-level back office,
    // and this asserts that none of that leaks into an in-app permission.
    const APP_ADMIN_MAINTAINER: UserRegion[] = [
      { ...userRegion(1, REGION_PERMISSION_READ, REGION_PERMISSION_EDIT, APP_PERMISSION_ADMIN), role: 'app_admin' },
    ]

    expect(canEditRegion(APP_ADMIN_MAINTAINER, 1)).toBe(false)
    expect(canEditRegion(APP_ADMIN_MAINTAINER, 99)).toBe(false)
  })
})
