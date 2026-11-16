/** grnyte's own mail skips an address Apple no longer forwards, against a real database and Resend stubbed at the edge. */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted((): string[] => [])
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (mail: { to: string | string[] }) => {
        sent.push([mail.to].flat().join(','))
        return { data: { id: 'sent' }, error: null }
      },
    }
  },
}))
vi.mock('./shell', () => ({ renderEmailHtml: () => '', renderEmailText: () => '' }))
vi.mock('$env/static/private', async (actual) => ({
  ...(await actual()),
  RESEND_API_KEY: 're_test',
  RESEND_SENDER_EMAIL: 'from@example.test',
}))
// A failing lookup at the database edge: `notForwarding` must fail open by itself.
const lookup = vi.hoisted(() => ({ fails: false }))
vi.mock('$lib/db/pinned.server', async (actual) => {
  const real = await actual<typeof import('$lib/db/pinned.server')>()
  return {
    ...real,
    pinnedTx: (body: Parameters<typeof real.pinnedTx>[0]) =>
      lookup.fails ? Promise.reject(new Error('database down')) : real.pinnedTx(body),
  }
})

const { reachable, sql } = await import('$lib/db/testDb')
const { addressHash } = await import('$lib/auth/mailForwarding.server')
const { sendEmail, sendEmailOutcome } = await import('./send.server')

const run = crypto.randomUUID().slice(0, 8)
const accounts: string[] = []

/** An account whose private Apple address no longer forwards. */
async function silenced(): Promise<{ address: string; id: string }> {
  const address = `silent-${run}-${accounts.length}@privaterelay.appleid.com`
  const [user] = await sql<{ id: string }[]>`
    insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${address}, now()) returning id`
  await sql`insert into public.apple_mail_forwarding (auth_user_fk, address_hash, forwarding, event_at)
    values (${user.id}, ${addressHash(address)}, false, now())`
  accounts.push(user.id)
  return { address, id: user.id }
}

const mail = (to: string) => ({ subject: 'Your role changed', template: 'role-changed', to }) as never

beforeEach(() => {
  sent.length = 0
  lookup.fails = false
})

afterAll(async () => {
  if (reachable) await sql`delete from auth.users where id = any(${accounts})`
  await sql.end()
})

describe.skipIf(!reachable)('sendEmailOutcome to an address Apple no longer forwards', () => {
  it('sends nothing and answers suppressed', async () => {
    const { address } = await silenced()

    expect(await sendEmailOutcome(mail(address))).toBe('suppressed')
    expect(await sendEmail(mail(address))).toBe(false)
    expect(sent).toEqual([])
  })

  it('still sends when the forwarding lookup fails', async () => {
    const { address } = await silenced()
    lookup.fails = true

    expect(await sendEmailOutcome(mail(address))).toBe('sent')
    expect(sent).toEqual([address])
  })

  it('still sends the deletion mail, which goes out once the account and its record are gone', async () => {
    const { address, id } = await silenced()
    await sql`delete from auth.users where id = ${id}`

    expect(await sendEmailOutcome(mail(address))).toBe('sent')
  })
})
