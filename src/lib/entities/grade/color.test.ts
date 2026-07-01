import { describe, expect, it } from 'vitest'
import { getGradeBand, getGradeColor, GRADE_COLORS, UNGRADED_COLOR } from './color'

describe('getGradeBand', () => {
  it('buckets grade ids into the four Font/V tiers', () => {
    // very easy ≤5C (ids 0–2), easy 6A–7A (3–9), medium 7A+–7C+ (10–14), hard ≥8A (15+)
    expect([0, 2].map(getGradeBand)).toEqual([1, 1])
    expect([3, 9].map(getGradeBand)).toEqual([2, 2])
    expect([10, 14].map(getGradeBand)).toEqual([3, 3])
    expect([15, 21].map(getGradeBand)).toEqual([4, 4])
  })

  it('returns undefined for an ungraded route', () => {
    expect(getGradeBand(undefined)).toBeUndefined()
  })
})

describe('getGradeColor', () => {
  it('resolves a raw id or an object to its band colour', () => {
    expect(getGradeColor(0)).toBe(GRADE_COLORS[0])
    expect(getGradeColor({ id: 15 })).toBe(GRADE_COLORS[3])
  })

  it('uses the neutral colour for an ungraded route', () => {
    expect(getGradeColor(undefined)).toBe(UNGRADED_COLOR)
  })
})
