/** The re-auth commands through the harness: the session gate and a status bound to action and target. */
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { reauthGrantStatus, requestReauthCode } from './reauth.remote'
import { sessionCaller, writeGrant } from './reauth.server'

const mailed = vi.hoisted(() => ({ count: 0 }))
vi.mock('$lib/email/send.server', () => ({ sendEmailOutcome: async () => (++mailed.count > 0 ? 'sent' : 'failed') }))

let user: SeedUser

beforeAll(async () => {
  if (!reachable) return
  ;({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

describe.skipIf(!reachable)('reauth remotes', () => {
  it('refuses a caller whose token has no session_id', async () => {
    const run = () =>
      asRequest(user.authId, () => requestReauthCode({ action: 'region.delete', target: '1' }), undefined, {
        session: false,
      })

    expect(await statusOf(run)).toBe(401)
  })

  it('answers the status true only for the caller’s own action and target', async () => {
    const answers = await asRequest(user.authId, async () => {
      await writeGrant(sessionCaller(), 'region.delete', '1', 'email_code')
      return Promise.all([
        reauthGrantStatus({ action: 'region.delete', target: '1' }),
        reauthGrantStatus({ action: 'region.delete', target: '2' }),
        reauthGrantStatus({ action: 'region.transfer', target: '1' }),
      ])
    })

    expect(answers).toEqual([true, false, false])
  })

  it('binds the account’s own actions to the caller, whatever target the page sent', async () => {
    const answer = await asRequest(user.authId, async () => {
      await writeGrant(sessionCaller(), 'account.delete', user.authId, 'email_code')
      return reauthGrantStatus({ action: 'account.delete', target: 'self' })
    })

    expect(answer).toBe(true)
  })

  it('mails an identity.link code only for a bare provider, never a bound target', async () => {
    mailed.count = 0
    const bound = () =>
      asRequest(user.authId, () => requestReauthCode({ action: 'identity.link', target: 'google:123' }))

    expect(await statusOf(bound)).toBe(400)
    expect(mailed.count).toBe(0)
    await asRequest(user.authId, () => requestReauthCode({ action: 'identity.link', target: 'google' }))
    expect(mailed.count).toBe(1)
  })

  it('answers false in another session of the same account', async () => {
    await asRequest(user.authId, () => writeGrant(sessionCaller(), 'region.delete', '3', 'email_code'))

    expect(await asRequest(user.authId, () => reauthGrantStatus({ action: 'region.delete', target: '3' }))).toBe(false)
  })
})
