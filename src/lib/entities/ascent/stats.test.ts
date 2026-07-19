import { describe, expect, it } from 'vitest'
import type { AscentType, UserAscentDetail } from './dto'
import { deriveStats, gradeCounts } from './stats'

// Only routeFk/type/dateTime/routeGradeFk are read; the rest of UserAscentDetail is irrelevant.
const ascent = (routeFk: number, type: AscentType, dateTime: number, routeGradeFk?: number): UserAscentDetail =>
  ({ dateTime, routeFk, routeGradeFk, type }) as UserAscentDetail

const sample: UserAscentDetail[] = [
  ascent(1, 'attempt', 100, 5),
  ascent(1, 'send', 100, 5), // route 1 sent at grade 5, same day
  ascent(2, 'flash', 200, 8), // route 2 flashed at grade 8, another day
  ascent(3, 'attempt', 200, 3), // route 3 only attempted (not a send)
  ascent(4, 'send', 300), // route 4 sent but ungraded
]

describe('deriveStats', () => {
  it('counts distinct sent routes, hardest grade, and days out', () => {
    expect(deriveStats(sample)).toEqual({ daysOut: 3, hardestGradeFk: 8, sends: 3 })
  })
})

describe('gradeCounts', () => {
  it('buckets each sent route once by its community grade', () => {
    expect(gradeCounts(sample, false)).toEqual(
      new Map([
        [5, 1],
        [8, 1],
      ]),
    )
  })

  it('flashOnly keeps only flashed routes', () => {
    expect(gradeCounts(sample, true)).toEqual(new Map([[8, 1]]))
  })
})
