/** The re-auth server API on a real database: codes, their limits, and grants bound to one caller, action and target. */
import { pinnedTx } from '$lib/db/pinned.server'
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindLinkGrant,
  hasGrant,
  holdGrant,
  issueReauthCode,
  spendGrant,
  unbindLinkGrant,
  verifyReauthCode,
  voidReauth,
  writeGrant,
  type ReauthCaller,
} from './reauth.server'

const mailed = vi.hoisted(() => [] as string[])
vi.mock('$lib/email/send.server', () => ({
  sendEmailOutcome: async ({ subject }: { subject: string }) => {
    mailed.push(subject)
    return 'sent'
  },
}))

const ids: string[] = []
async function caller(): Promise<ReauthCaller> {
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (id, email, email_confirmed_at)
    values (gen_random_uuid(), ${`reauth-${crypto.randomUUID().slice(0, 8)}@example.org`}, now()) returning id`
  ids.push(row.id)
  return { authUserId: row.id, sessionId: crypto.randomUUID() }
}

const mail = { email: 'x@example.org', locale: 'en' as const }
const lastCode = () => mailed.at(-1)!.slice(0, 6)
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
const at = (ms: number) => vi.setSystemTime(Date.now() + ms)

beforeEach(() => {
  mailed.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => vi.useRealTimers())
afterAll(async () => {
  if (reachable) await sql`delete from auth.users where id = any(${ids})`
})

describe.skipIf(!reachable)('bindLinkGrant', () => {
  it("re-targets only this session's identity.link grant for that provider", async () => {
    const me = await caller()
    const otherSession = { ...me, sessionId: crypto.randomUUID() }
    await writeGrant(otherSession, 'identity.link', 'google', 'email_code')
    await writeGrant(me, 'identity.link', 'apple', 'email_code')

    expect(await bindLinkGrant(me, 'google', 'sub-1')).toBe(false)
    await writeGrant(me, 'identity.link', 'google', 'email_code')
    expect(await bindLinkGrant(me, 'google', 'sub-1')).toBe(true)
    expect(await hasGrant(me, 'identity.link', 'google:sub-1')).toBe(true)
    expect(await hasGrant(otherSession, 'identity.link', 'google')).toBe(true)
    expect(await hasGrant(me, 'identity.link', 'apple')).toBe(true)
  })

  it('gives a bound grant back, and leaves both when the session already holds a newer bare one', async () => {
    const me = await caller()
    await writeGrant(me, 'identity.link', 'google', 'email_code')
    await bindLinkGrant(me, 'google', 'sub-2')
    await unbindLinkGrant(me, 'google', 'sub-2')
    expect(await hasGrant(me, 'identity.link', 'google')).toBe(true)

    await bindLinkGrant(me, 'google', 'sub-3')
    await writeGrant(me, 'identity.link', 'google', 'email_code')
    await expect(unbindLinkGrant(me, 'google', 'sub-3')).resolves.toBeUndefined()
    expect(await hasGrant(me, 'identity.link', 'google')).toBe(true)
    expect(await hasGrant(me, 'identity.link', 'google:sub-3')).toBe(true)
  })
})

describe.skipIf(!reachable)('reauth codes', () => {
  it('answers expired for a code verified at 10 min 1 s', async () => {
    const me = await caller()
    await issueReauthCode(me, 'account.delete', me.authUserId, mail)
    at(10 * 60_000 + 1000)

    expect(await verifyReauthCode(me, 'account.delete', me.authUserId, lastCode())).toBe('expired')
  })

  it('voids the code on the fifth wrong try, which answers void at once', async () => {
    const me = await caller()
    await issueReauthCode(me, 'region.delete', '1', mail)
    const code = lastCode()
    for (let i = 0; i < 4; i++) expect(await verifyReauthCode(me, 'region.delete', '1', wrong(code))).toBe('wrong')
    expect(await verifyReauthCode(me, 'region.delete', '1', wrong(code))).toBe('void')

    expect(await verifyReauthCode(me, 'region.delete', '1', code)).toBe('void')
  })

  it('voids the first code with a second issue', async () => {
    const me = await caller()
    await issueReauthCode(me, 'region.delete', '1', mail)
    const first = lastCode()
    await issueReauthCode(me, 'region.delete', '1', mail)
    if (lastCode() === first) return // one in a million: the same digits again

    expect(await verifyReauthCode(me, 'region.delete', '1', first)).toBe('wrong')
    expect(await verifyReauthCode(me, 'region.delete', '1', lastCode())).toBe('granted')
  })

  it('sends nothing on the sixth issue in an hour, and again after the hour', async () => {
    const me = await caller()
    for (let i = 0; i < 5; i++) await issueReauthCode(me, 'region.delete', String(i), mail)

    expect(await issueReauthCode(me, 'region.delete', '9', mail)).toBe('limited')
    expect(mailed).toHaveLength(5)

    await sql`update public.auth_code_attempts set window_started_at = now() - interval '61 minutes'
      where subject = ${me.authUserId} and kind = 'reauth_issue'`
    expect(await issueReauthCode(me, 'region.delete', '9', mail)).not.toBe('limited')
  })
})

describe.skipIf(!reachable)('reauth grants', () => {
  it('is spent only for its own action, target, session and account', async () => {
    const me = await caller()
    const other = await caller()
    await writeGrant(me, 'region.delete', '1', 'email_code')
    const spend = (who: ReauthCaller, action: 'account.delete' | 'region.delete', target: string) =>
      pinnedTx((tx) => spendGrant(tx, who, action, target))

    expect(await spend(me, 'region.delete', '2')).toBe(false)
    expect(await spend(me, 'account.delete', '1')).toBe(false)
    expect(await spend({ ...me, sessionId: crypto.randomUUID() }, 'region.delete', '1')).toBe(false)
    expect(await spend({ ...other, sessionId: me.sessionId }, 'region.delete', '1')).toBe(false)
    expect(await spend(me, 'region.delete', '1')).toBe(true)
  })

  it('answers false when spent at 5 min 1 s', async () => {
    const me = await caller()
    await writeGrant(me, 'account.delete', me.authUserId, 'email_code')
    at(5 * 60_000 + 1000)

    expect(await pinnedTx((tx) => spendGrant(tx, me, 'account.delete', me.authUserId))).toBe(false)
  })

  it('keeps a held grant when the handler then throws', async () => {
    const me = await caller()
    await writeGrant(me, 'password.change', me.authUserId, 'email_code')
    await pinnedTx(async (tx) => {
      await holdGrant(tx, me, 'password.change', me.authUserId)
      throw new Error('GoTrue refused')
    }).catch(() => {})

    expect(await hasGrant(me, 'password.change', me.authUserId)).toBe(true)
  })

  it('spends once for two concurrent hold and spend pairs', async () => {
    const me = await caller()
    await writeGrant(me, 'password.change', me.authUserId, 'email_code')
    const pair = () =>
      pinnedTx(
        async (tx) =>
          (await holdGrant(tx, me, 'password.change', me.authUserId)) &&
          (await spendGrant(tx, me, 'password.change', me.authUserId)),
      )

    expect((await Promise.all([pair(), pair()])).filter(Boolean)).toHaveLength(1)
  })

  it('voidReauth removes the account’s open code and grant and leaves another account’s', async () => {
    const me = await caller()
    const other = await caller()
    for (const who of [me, other]) {
      await issueReauthCode(who, 'region.delete', '1', mail)
      await writeGrant(who, 'account.delete', who.authUserId, 'email_code')
    }
    await voidReauth(me.authUserId)

    expect(await hasGrant(me, 'account.delete', me.authUserId)).toBe(false)
    expect(await verifyReauthCode(me, 'region.delete', '1', '000000')).toBe('void')
    expect(await hasGrant(other, 'account.delete', other.authUserId)).toBe(true)
    expect(await verifyReauthCode(other, 'region.delete', '1', wrong(lastCode()))).toBe('wrong')
  })
})
