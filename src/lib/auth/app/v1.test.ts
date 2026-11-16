import { describe, expect, it } from 'vitest'
import { V1 } from './v1'

describe('V1 request shapes', () => {
  it('takes an unconfirmed sign-in address as the web form does: trimmed, not validated', () => {
    const request = V1['signin/unconfirmed'].request
    expect(request.parse({ email: ' user@example.com ', password: 'x' }).email).toBe('user@example.com')
    expect(request.safeParse({ email: '  ', password: 'x' }).success).toBe(false)
  })
})
