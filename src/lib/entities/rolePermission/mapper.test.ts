import { appRole } from '$lib/db/schema'
import { describe, expect, it } from 'vitest'
import { roleLabel } from './mapper'

describe('roleLabel', () => {
  it('names the three roles a region member can hold', () => {
    expect(roleLabel('region_admin')).toBe('Admin')
    expect(roleLabel('region_maintainer')).toBe('Maintainer')
    expect(roleLabel('region_user')).toBe('User')
  })

  it('has a label for every role in the enum, so a new one cannot render blank', () => {
    for (const role of appRole.enumValues) {
      expect(roleLabel(role), role).toBeTruthy()
    }
  })
})
