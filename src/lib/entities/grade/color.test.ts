import { describe, expect, it } from 'vitest'
import { getGradeBand, getGradeColor, GRADE_COLORS, UNGRADED_COLOR } from './color'

describe('getGradeBand', () => {
  it('buckets grade ids into the four Font/V tiers', () => {
    // very easy ≤5+ (ids 0–4), easy 6A–7A (5–11), medium 7A+–7C+ (12–16), hard ≥8A (17+)
    // `grades.test.ts` pins these boundaries to the Font labels they are named for.
    expect([0, 4].map(getGradeBand)).toEqual([1, 1])
    expect([5, 11].map(getGradeBand)).toEqual([2, 2])
    expect([12, 16].map(getGradeBand)).toEqual([3, 3])
    expect([17, 24].map(getGradeBand)).toEqual([4, 4])
  })

  it('returns undefined for an ungraded route', () => {
    expect(getGradeBand(undefined)).toBeUndefined()
  })
})

describe('getGradeColor', () => {
  it('resolves a raw id or an object to its band colour', () => {
    expect(getGradeColor(0)).toBe(GRADE_COLORS[0])
    expect(getGradeColor({ id: 17 })).toBe(GRADE_COLORS[3])
  })

  it('uses the neutral colour for an ungraded route', () => {
    expect(getGradeColor(undefined)).toBe(UNGRADED_COLOR)
  })
})
