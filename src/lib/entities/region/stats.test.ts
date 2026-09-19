import { describe, expect, it } from 'vitest'
import { ACTIVITY_MONTHS, activityMonths, activityWindowStart, emptyMemberSplit, monthStart } from './stats'

const AUG = Date.UTC(2026, 7, 1)
const SEP = Date.UTC(2026, 8, 1)

describe('monthStart', () => {
  it('floors a timestamp to the first of its UTC month', () => {
    expect(monthStart(Date.UTC(2026, 8, 16, 21, 30))).toBe(SEP)
  })

  it('keeps a first-of-month timestamp where it is', () => {
    expect(monthStart(SEP)).toBe(SEP)
  })
})

describe('activityMonths', () => {
  const now = Date.UTC(2026, 8, 16)

  it('returns a full window ending with the current month, oldest first', () => {
    const months = activityMonths(new Map(), now)

    expect(months).toHaveLength(ACTIVITY_MONTHS)
    expect(months.at(0)?.month).toBe(Date.UTC(2025, 9, 1))
    expect(months.at(-1)?.month).toBe(SEP)
  })

  it('fills untouched months with zero rather than dropping them', () => {
    const months = activityMonths(new Map([[SEP, 4]]), now)

    expect(months.every((month) => Number.isInteger(month.count))).toBe(true)
    expect(months.filter((month) => month.count === 0)).toHaveLength(ACTIVITY_MONTHS - 1)
  })

  it('places a count in its own month', () => {
    const months = activityMonths(
      new Map([
        [AUG, 7],
        [SEP, 4],
      ]),
      now,
    )

    expect(months.at(-1)).toEqual({ count: 4, month: SEP })
    expect(months.at(-2)).toEqual({ count: 7, month: AUG })
  })

  it('ignores a count outside the window', () => {
    const months = activityMonths(new Map([[Date.UTC(2024, 0, 1), 99]]), now)

    expect(months.reduce((total, month) => total + month.count, 0)).toBe(0)
  })

  it('crosses a year boundary', () => {
    const months = activityMonths(new Map(), Date.UTC(2026, 0, 9))

    expect(months.at(0)?.month).toBe(Date.UTC(2025, 1, 1))
    expect(months.at(-1)?.month).toBe(Date.UTC(2026, 0, 1))
  })
})

describe('activityWindowStart', () => {
  it('is the oldest month the chart shows', () => {
    const now = Date.UTC(2026, 8, 16)

    expect(activityWindowStart(now)).toBe(activityMonths(new Map(), now).at(0)?.month)
  })
})

describe('emptyMemberSplit', () => {
  it('carries every assignable role at zero', () => {
    expect(emptyMemberSplit()).toEqual({ region_admin: 0, region_maintainer: 0, region_user: 0 })
  })

  it('returns a fresh object each call', () => {
    const split = emptyMemberSplit()
    split.region_admin = 3

    expect(emptyMemberSplit().region_admin).toBe(0)
  })
})
