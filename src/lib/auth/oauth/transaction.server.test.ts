/** The web carrier's transaction cookie: sealed, Lax, ten minutes, single use. */
import { describe, expect, it } from 'vitest'
import { cookieJar } from './cookieJar.fixture'
import { takeWebTransaction, writeWebTransaction, type OAuthTransaction } from './transaction.server'

const TX: OAuthTransaction = {
  carrier: 'web',
  codeVerifier: 'verifier',
  intent: { kind: 'signin' },
  next: null,
  nonce: 'nonce',
  provider: 'google',
  returnTo: '/auth/signin?form=signin',
  startedAt: 1,
  state: 'state',
}

const url = new URL('https://grnyte.example/auth/oauth/google')

describe('web transaction cookie', () => {
  it('is HttpOnly, Lax, on /, ten minutes, with the __Host- prefix over https', async () => {
    const jar = cookieJar()
    await writeWebTransaction({ cookies: jar.cookies, url }, TX)

    expect(jar.written).toEqual([
      {
        name: '__Host-grnyte-oauth',
        options: { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax', secure: true },
        value: expect.any(String),
      },
    ])
  })

  it('is taken once: a second take answers null', async () => {
    const jar = cookieJar()
    await writeWebTransaction({ cookies: jar.cookies, url }, TX)

    expect(await takeWebTransaction({ cookies: jar.cookies, url })).toEqual(TX)
    expect(await takeWebTransaction({ cookies: jar.cookies, url })).toBeNull()
  })

  it('answers null and sets nothing when there is no cookie', async () => {
    const jar = cookieJar()

    expect(await takeWebTransaction({ cookies: jar.cookies, url })).toBeNull()
    expect(jar.written).toEqual([])
  })
})
