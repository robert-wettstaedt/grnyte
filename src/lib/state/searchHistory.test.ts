import { describe, expect, it } from 'vitest'
import { addToHistory, removeFromHistory } from './searchHistory'

describe('addToHistory', () => {
  it('trims and prepends', () => {
    expect(addToHistory([], '  boulder ')).toEqual(['boulder'])
  })

  it('dedupes case-insensitively, keeping the new casing on top', () => {
    expect(addToHistory(['boulder', 'crimp'], 'Boulder')).toEqual(['Boulder', 'crimp'])
  })

  it('caps the list', () => {
    expect(addToHistory(['a', 'b'], 'c', 2)).toEqual(['c', 'a'])
  })

  it('ignores blank queries', () => {
    expect(addToHistory(['a'], '   ')).toEqual(['a'])
  })
})

describe('removeFromHistory', () => {
  it('drops the exact entry', () => {
    expect(removeFromHistory(['a', 'b'], 'a')).toEqual(['b'])
  })
})
