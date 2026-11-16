import { describe, expect, it } from 'vitest'
import { lastMethod } from './lastMethod.server'

const jar = (value?: string) => ({ get: () => value })

describe('lastMethod', () => {
  it('reads back apple, google and email only', () => {
    expect(['apple', 'google', 'email', 'facebook', 'Apple', '', undefined].map((v) => lastMethod(jar(v)))).toEqual([
      'apple',
      'google',
      'email',
      null,
      null,
      null,
      null,
    ])
  })
})
