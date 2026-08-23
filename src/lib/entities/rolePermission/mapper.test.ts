import { appRole } from '$lib/db/schema'
import { describe, expect, it } from 'vitest'
import { roleLabel } from './mapper'

describe('roleLabel', () => {
  it('names the three roles a region member can hold', () => {
    expect(roleLabel('region_admin')).toBe('Admin')
    expect(roleLabel('region_maintainer')).toBe('Maintainer')
    expect(roleLabel('region_user')).toBe('User')
  })

  it('gives every role in the enum its exact label, app_admin included', () => {
    const LABELS: Record<(typeof appRole.enumValues)[number], string> = {
      app_admin: 'Admin',
      region_admin: 'Admin',
      region_maintainer: 'Maintainer',
      region_user: 'User',
    }

    for (const role of appRole.enumValues) {
      expect(roleLabel(role), role).toBe(LABELS[role])
    }
  })
})
