import { describe, expect, it } from 'vitest'
import { stringifyError } from './stringify'

describe('stringifyError', () => {
  it('keeps an Error name, message and stack', () => {
    const result = stringifyError(new TypeError('boom'))

    expect(result).toContain('TypeError')
    expect(result).toContain('boom')
  })

  // Structure, never values: a thrown payload can carry a request body, an entity mid-edit or a
  // route's coordinates, and none of that belongs in an error log.
  it('names a thrown object and its keys, without serialising what is in them', () => {
    const result = stringifyError({ lat: 47.123456, lng: 11.654321, routeName: 'Secret Project' })

    expect(result).toContain('keys: lat, lng, routeName')
    expect(result).not.toContain('47.12')
    expect(result).not.toContain('Secret Project')
  })

  it('handles null, which shares a typeof with an object', () => {
    expect(stringifyError(null)).toBe('object thrown: null')
  })

  // Callers slice the result, so a non-string would throw inside the reporter rather than report.
  it.each([
    ['undefined', undefined],
    ['a function', () => undefined],
    ['a symbol', Symbol('nope')],
  ])('returns a string for %s, which JSON.stringify does not', (_label, value) => {
    const result = stringifyError(value)

    expect(typeof result).toBe('string')
    expect(() => result.slice(0, 10)).not.toThrow()
  })
})
