import { expect, it, vi } from 'vitest'
import { sortByName } from './collator'

vi.mock('$lib/paraglide/runtime', () => ({ getLocale: () => 'de' }))

it('orders raw names as a reader does, not by their bytes, a nameless row first', () => {
  const rows = ['Zecke', 'ärger', 'ameise', 'Block 10', 'Block 9', ''].map((name, index) => ({ id: index, name }))

  expect(sortByName(rows).map((row) => row.name)).toEqual(['', 'ameise', 'ärger', 'Block 9', 'Block 10', 'Zecke'])
})

it('breaks a tie by id, so rows syncing in do not swap places', () => {
  expect(
    sortByName([
      { id: 2, name: 'Dach' },
      { id: 1, name: 'Dach' },
    ]).map((row) => row.id),
  ).toEqual([1, 2])
})
