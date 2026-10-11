import { describe, expect, it } from 'vitest'
import { escapeLikeTerm } from './filters'

describe('escapeLikeTerm', () => {
  it.each([
    ['sun', 'sun'],
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
  ])('%s -> %s', (input, expected) => {
    expect(escapeLikeTerm(input)).toBe(expected)
  })
})
