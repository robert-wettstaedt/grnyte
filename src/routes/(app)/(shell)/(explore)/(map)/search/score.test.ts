import { describe, expect, it } from 'vitest'
import { matchScore } from './score'

describe('matchScore', () => {
  it('ranks exact > prefix > word-prefix > substring > miss', () => {
    expect(matchScore('Don', 'don')).toBe(100)
    expect(matchScore('Donautal', 'don')).toBe(80)
    expect(matchScore('Techo don Pepo', 'don')).toBe(60)
    expect(matchScore('Adoniskomplex', 'don')).toBe(40)
    expect(matchScore('City Slicker', 'don')).toBe(0)
  })

  it('is case-insensitive and trims', () => {
    expect(matchScore('  Don Quichote ', 'DON')).toBe(80)
  })

  it('scores an empty query as no match', () => {
    expect(matchScore('Donautal', '')).toBe(0)
  })

  it('scores an empty name as no match (unnamed routes score on their raw, empty name)', () => {
    expect(matchScore('', 'name')).toBe(0)
  })
})
