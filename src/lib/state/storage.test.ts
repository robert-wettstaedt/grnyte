import { afterEach, describe, expect, it, vi } from 'vitest'
import { storage } from './storage'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('storage', () => {
  it('reads back what it wrote', () => {
    expect(storage.set('k', 'v')).toBe(true)
    expect(storage.get('k')).toBe('v')
  })

  it('swallows a browser that blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(storage.get('k')).toBeNull()
    expect(storage.set('k', 'v')).toBe(false)
  })
})
