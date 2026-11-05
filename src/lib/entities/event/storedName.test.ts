import { describe, expect, it } from 'vitest'
import { readStoredName, storedName } from './storedName'

describe('stored names', () => {
  it('keeps a real name as written', () => {
    expect(readStoredName(storedName('Kante'))).toBe('Kante')
  })

  it('mints a nameless block by its slot, and anything else as unnamed, when read', () => {
    expect(storedName(' ', 2)).not.toBe(storedName(' ', 3))
    expect(readStoredName(storedName('', 2))).toBe('Block 3')
    expect(readStoredName(storedName(null))).toBe('Unnamed')
  })
})
