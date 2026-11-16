/** Labelled keys derive from the secret key so open challenges survive a deploy. */
import { withSecretKey } from '$lib/db/secretKey.fixture'
import { describe, expect, it } from 'vitest'

const keys = () => withSecretKey('sb_secret_fixed-test-secret', () => import('./keys.server'))

describe('labelledKey', () => {
  it('matches the digest the pre-move proof-of-work code derived', async () => {
    const { labelledKey } = await keys()

    // HMAC-SHA256(secret, label) as hex.
    expect(labelledKey('altcha-challenge-signature')).toBe(
      'bedd64cbbdb603ec3fa488517aae55ae77085f3bd3a12308e147c1f54a582ae7',
    )
  })

  it('gives two labels two keys', async () => {
    const { labelledKey } = await keys()

    expect(labelledKey('reauth-code')).not.toBe(labelledKey('signup-resend'))
  })
})
