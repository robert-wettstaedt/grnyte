import { describe, expect, it } from 'vitest'
import { ascentStatusByRoute } from './status'

describe('ascentStatusByRoute', () => {
  it('picks the highest-priority ascent per route (repeat > flash > send > attempt)', () => {
    const map = ascentStatusByRoute([
      // Sent, then attempted again — the send still counts.
      { routeFk: 1, type: 'send' },
      { routeFk: 1, type: 'attempt' },
      // Flashed, then repeated — the repeat wins.
      { routeFk: 2, type: 'flash' },
      { routeFk: 2, type: 'repeat' },
      // Order-independent: flash outranks an earlier-listed send.
      { routeFk: 3, type: 'send' },
      { routeFk: 3, type: 'flash' },
      { routeFk: 4, type: 'attempt' },
    ])

    expect(map.get(1)).toBe('send')
    expect(map.get(2)).toBe('repeat')
    expect(map.get(3)).toBe('flash')
    expect(map.get(4)).toBe('attempt')
    expect(map.get(5)).toBeUndefined()
  })
})
