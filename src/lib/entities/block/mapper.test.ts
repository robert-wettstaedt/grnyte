import { describe, expect, it } from 'vitest'
import { toGradeSummary } from './mapper'

describe('toGradeSummary', () => {
  it('counts every live route but draws only graded ones in the donut', () => {
    const summary = toGradeSummary({ '12': 2, '15': 1, none: 3 })
    expect(summary.routeCount).toBe(6)
    expect([...summary.gradeCounts]).toEqual([
      [12, 2],
      [15, 1],
    ])
  })

  it('reads a block without routes, or a row from before the column, as empty', () => {
    expect(toGradeSummary({})).toEqual({ gradeCounts: new Map(), routeCount: 0 })
    expect(toGradeSummary(undefined)).toEqual({ gradeCounts: new Map(), routeCount: 0 })
  })
})
