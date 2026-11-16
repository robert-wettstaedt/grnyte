/** `GET challenge` and `POST signup`, called with built requests; the account itself needs GoTrue. */
import { appCall } from '$lib/auth/app/appRequest.fixture'
import { V1 } from '$lib/auth/app/v1'
import { gotrueReachable } from '$lib/auth/server/gotrue.fixture'
import { reachable, sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/proofOfWorkFixture'
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { afterAll, describe, expect, it } from 'vitest'
import { signUp } from '../../../../(landing)/auth/(tabs)/signup/signup.remote'
import { GET as challenge } from '../challenge/+server'
import { POST as signup } from './+server'

const run = crypto.randomUUID().slice(0, 8)
const address = (name: string) => `app-${name}-${run}@example.org`
const created: string[] = []
const PASSWORD = 'app-signup-password-1'
const accounts = async (email: string) => sql`select id from auth.users where email = ${email}`

afterAll(async () => {
  if (reachable) await sql`delete from auth.users where email = any(${created})`
})

describe('GET challenge', () => {
  it('answers a challenge that solves', async () => {
    const response = await appCall(challenge, 'challenge', { method: 'GET' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = V1.challenge.response.parse(await response.json())
    expect(await solveChallenge({ challenge: body as never, deriveKey })).not.toBeNull()
  })
})

describe.skipIf(!reachable)('POST signup', () => {
  it('creates nothing for an unsolved proof of work', async () => {
    const email = address('bot')
    created.push(email)
    const response = await appCall(signup, 'signup', { body: { email, password: PASSWORD, proofOfWork: 'unsolved' } })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'auth_verificationFailed' } })
    expect(await accounts(email)).toHaveLength(0)
  })

  it('refuses a password the web refuses, with its key', async () => {
    const response = await appCall(signup, 'signup', {
      body: { email: address('short'), password: 'short', proofOfWork: 'unsolved' },
    })
    expect(response.status).toBe(400)
    expect((await response.json()).error.field).toBe('password')
  })
})

describe.skipIf(!gotrueReachable)('POST signup on GoTrue', { timeout: 20_000 }, () => {
  it('creates the account the remote function creates (parity)', async () => {
    const [viaApp, viaWeb] = [address('app'), address('web')]
    created.push(viaApp, viaWeb)

    const app = await appCall(signup, 'signup', {
      body: { email: viaApp, password: PASSWORD, proofOfWork: (await solvedProofOfWork()).encoded },
    })
    const web = await asAnonymousRequest({ auth: {} }, async () =>
      callForm<{ result?: { success: boolean } }>(signUp, {
        altcha: (await solvedProofOfWork()).encoded,
        email: viaWeb,
        password: PASSWORD,
      }),
    )

    expect(V1.signup.response.parse(await app.json()).ok).toBe(web.result?.success)
    expect(await accounts(viaApp)).toHaveLength(1)
    expect(await accounts(viaWeb)).toHaveLength(1)
  })
})
