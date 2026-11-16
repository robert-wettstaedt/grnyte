import { isRedirect, redirect, type Cookies, type RequestEvent } from '@sveltejs/kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cookieJar } from './cookieJar.fixture'
import { fakeIssuer, PROVIDER_ENV, RAW_NONCE, RAW_NONCE_DIGEST } from './issuer.fixture'
import {
  takeWebTransaction,
  writeWebTransaction,
  type CallbackResult,
  type OAuthTransaction,
  type TransactionCarrier,
} from './transaction.server'

const env = vi.hoisted((): Record<string, string> => ({}))
vi.mock('$env/dynamic/private', async (actual) => ({
  env: Object.assign(env, (await actual<{ env: Record<string, string> }>()).env),
}))

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

/** Change 3's carrier contract, through a stub put first in `carriers`. */
describe('a carrier ahead of the web carrier', async () => {
  const { carriers, completeOAuth } = await import('./flow.server')
  const STATE = 'app-state'

  /** Cookies that fail the test on any read or write. */
  const untouchable = new Proxy({} as Cookies, {
    get: (_target, name) => () => {
      throw new Error(`web cookie touched: ${String(name)}`)
    },
  })
  const callback = () =>
    ({
      cookies: untouchable,
      getClientAddress: () => '198.51.100.7',
      url: new URL(`https://grnyte.example/auth/callback/google?state=${STATE}&code=provider-code`),
    }) as unknown as RequestEvent

  Object.assign(env, PROVIDER_ENV)
  afterEach(() => {
    carriers.splice(0, carriers.length - 1)
  })

  it('claims its state, runs the checks and the code grant, and lands with a proof', async () => {
    const issuer = fakeIssuer()
    issuer.rememberNonce(RAW_NONCE_DIGEST)
    const landed: CallbackResult[] = []
    carriers.unshift({
      land: async (_event, _tx, result) => {
        landed.push(result)
        throw new Error('landed')
      },
      take: async (_event, state) =>
        state === STATE ? { ...TX, nonce: RAW_NONCE, startedAt: Date.now(), state: STATE } : null,
    } satisfies TransactionCarrier)

    await expect(completeOAuth(callback(), 'google')).rejects.toThrow('landed')
    expect(issuer.tokenRequests).toHaveLength(1)
    expect(landed).toEqual([{ kind: 'proof', proof: expect.objectContaining({ rawNonce: RAW_NONCE }) }])
  })

  it('lets a redirect thrown by take end the request, with no code grant', async () => {
    const issuer = fakeIssuer()
    carriers.unshift({
      land: () => Promise.reject(new Error('not reached')),
      take: async () => redirect(303, 'rocks.grnyte:/auth?error=expired'),
    } satisfies TransactionCarrier)

    const thrown: unknown = await completeOAuth(callback(), 'google').catch((e: unknown) => e)
    expect(isRedirect(thrown) && thrown.location).toBe('rocks.grnyte:/auth?error=expired')
    expect(issuer.tokenRequests).toEqual([])
  })
})
