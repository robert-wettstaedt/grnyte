import { describe, expect, it } from 'vitest'
import { formError, passwordSchema } from './schemas'

const refusal = (password: string) => passwordSchema.safeParse(password).error?.issues.map((issue) => issue.message)

describe('passwordSchema', () => {
  it.each([' leading-space', 'trailing-space ', 'trailing-tab\t'])(
    'refuses surrounding whitespace in %j instead of trimming it',
    (password) => {
      expect(refusal(password)).toEqual([formError('auth_passwordSpaces')])
    },
  )

  it('keeps whitespace inside the password', () => {
    expect(passwordSchema.parse('correct horse')).toBe('correct horse')
  })

  it('composes "e" plus a combining acute into U+00E9', () => {
    expect(passwordSchema.parse('café-latte')).toBe('café-latte')
  })

  it('caps the normalised password at 72 bytes', () => {
    // "é" is two bytes once composed; decomposed it is three, which alone would exceed the cap.
    expect(passwordSchema.parse('é'.repeat(36))).toBe('é'.repeat(36))
    expect(passwordSchema.parse('é'.repeat(36))).toBe('é'.repeat(36))
    expect(refusal(`${'é'.repeat(36)}x`)).toEqual([formError('auth_passwordTooLong')])
  })

  it('still asks for 8 characters', () => {
    expect(refusal('short')).toEqual([formError('auth_passwordTooShort')])
  })
})
