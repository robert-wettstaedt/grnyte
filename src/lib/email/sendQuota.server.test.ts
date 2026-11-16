/** Resend's quota refusals log one stable message, so the error alert groups every template into one. */
import { reachable, sql } from '$lib/db/testDb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmailOutcome } from './send.server'

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async () => ({ data: null, error: { message: 'm', name: 'daily_quota_exceeded' } }) }
  },
}))
vi.mock('./shell', () => ({ renderEmailHtml: () => '', renderEmailText: () => '' }))
vi.mock('$env/static/private', async (original) => ({
  ...(await original()),
  RESEND_API_KEY: 're_test',
  RESEND_SENDER_EMAIL: 'from@example.test',
}))

const QUOTA_ROWS = '[email] mail quota exhausted%'

beforeEach(async () => {
  if (reachable) await sql`delete from public.client_error_logs where error like ${QUOTA_ROWS}`
})

describe.skipIf(!reachable)('sendEmailOutcome on a quota refusal', () => {
  it('stores one grouping key for two templates', async () => {
    await sendEmailOutcome({ subject: 's', template: 'invite', to: 'a@example.test' } as never)
    await sendEmailOutcome({ subject: 's', template: 'reauthCode', to: 'b@example.test' } as never)

    const rows = await sql<{ error: string }[]>`
      select distinct error from public.client_error_logs where error like ${QUOTA_ROWS}`
    expect(rows.map((row) => row.error)).toEqual(['[email] mail quota exhausted (daily_quota_exceeded)'])
  })
})
