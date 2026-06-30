import { describe, expect, it } from 'vitest'
import { toSheetNav } from './siblingNav'

const href = (id: number) => `/x/${id}`
const list = [
  { id: 10, name: 'A' },
  { id: 20, name: 'B' },
  { id: 30, name: 'C' },
]

describe('toSheetNav', () => {
  it('returns null when nav is not navigable', () => {
    expect(toSheetNav([{ id: 1, name: 'only' }], 1, href)).toBeNull() // single sibling
    expect(toSheetNav(list, 99, href)).toBeNull() // current not in list (loading)
    expect(toSheetNav(null, 10, href)).toBeNull()
    expect(toSheetNav(list, null, href)).toBeNull()
  })

  it('wraps prev before the first to the last', () => {
    expect(toSheetNav(list, 10, href)).toEqual({
      prev: { href: '/x/30', label: 'C' },
      next: { href: '/x/20', label: 'B' },
      position: 1,
      total: 3,
    })
  })

  it('wraps next past the last to the first', () => {
    expect(toSheetNav(list, 30, href)).toMatchObject({
      prev: { label: 'B' },
      next: { label: 'A' },
      position: 3,
      total: 3,
    })
  })
})
