import { describe, expect, it } from 'vitest'
import { ascentStatusByRoute } from './status'

describe('ascentStatusByRoute', () => {
  it('picks the highest-priority ascent per route (repeat > flash > redpoint > attempt)', () => {
    const map = ascentStatusByRoute([
      // Sent, then attempted again: the redpoint still counts.
      { routeFk: 1, type: 'redpoint' },
      { routeFk: 1, type: 'attempt' },
      // Flashed, then repeated: the repeat wins.
      { routeFk: 2, type: 'flash' },
      { routeFk: 2, type: 'repeat' },
      // Order-independent: flash outranks an earlier-listed redpoint.
      { routeFk: 3, type: 'redpoint' },
      { routeFk: 3, type: 'flash' },
      { routeFk: 4, type: 'attempt' },
    ])

    expect(map.get(1)).toBe('redpoint')
    expect(map.get(2)).toBe('repeat')
    expect(map.get(3)).toBe('flash')
    expect(map.get(4)).toBe('attempt')
    expect(map.get(5)).toBeUndefined()
  })
})
