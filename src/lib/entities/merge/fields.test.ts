import { describe, expect, it } from 'vitest'
import { conflicts, resolved, stepAfterPick } from './fields'

describe('stepAfterPick', () => {
  it('skips the fields step when nothing differs', () => {
    expect(stepAfterPick([])).toBe('confirm')
  })

  it('asks when a field differs', () => {
    expect(stepAfterPick(['gradeFk'])).toBe('fields')
  })
})

const KEYS = ['description', 'gradeFk', 'name'] as const

describe('merge fields', () => {
  it('asks only where both sides hold different values', () => {
    expect(
      conflicts(
        { description: '', gradeFk: 11, name: 'Kante' },
        { description: 'Crimps', gradeFk: 12, name: 'Kante' },
        KEYS,
      ),
    ).toEqual(['gradeFk'])
  })

  it('fills what the survivor lacks and keeps the person’s choice over both', () => {
    expect(
      resolved(
        { description: null, gradeFk: 11, name: 'Kante' },
        { description: 'Crimps', gradeFk: 12, name: 'Linke' },
        KEYS,
        {
          gradeFk: 12,
        },
      ),
    ).toEqual({ description: 'Crimps', gradeFk: 12 })
  })

  it('treats whitespace as empty', () => {
    expect(
      resolved(
        { description: '  ', gradeFk: null, name: 'A' },
        { description: 'x', gradeFk: null, name: 'B' },
        KEYS,
        {},
      ),
    ).toEqual({
      description: 'x',
    })
  })
})
