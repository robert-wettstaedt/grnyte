import { describe, expect, it } from 'vitest'
import { seatState } from './mapper'

describe('seatState', () => {
  it('is ok while there is room to spare', () => {
    expect(seatState(0, 10)).toBe('ok')
    expect(seatState(8, 10)).toBe('ok')
  })

  it('warns on the last free seat', () => {
    expect(seatState(9, 10)).toBe('oneLeft')
  })

  it('is full once every seat is taken', () => {
    expect(seatState(10, 10)).toBe('full')
  })

  it('reports an over-full region as full rather than a state of its own', () => {
    // Regions seeded before the limit existed can sit above it; there is nothing
    // different for the user to do about it, so it reads the same as exactly full.
    expect(seatState(14, 10)).toBe('full')
  })

  it('is full for a region with no seats at all', () => {
    expect(seatState(0, 0)).toBe('full')
  })

  it('warns rather than reporting full for a one-seat region that is empty', () => {
    expect(seatState(0, 1)).toBe('oneLeft')
  })
})
