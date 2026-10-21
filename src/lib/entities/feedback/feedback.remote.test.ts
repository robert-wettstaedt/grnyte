/**
 * `replyToFeedback` through the real handler: a failed send must leave the row answerable again.
 * Assert on the database afterwards.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { sendEmailOutcome } from '$lib/email/send.server'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listFeedback, replyToFeedback } from './feedback.remote'

vi.mock('$lib/email/send.server', () => ({ sendEmailOutcome: vi.fn() }))

const BODY = '__feedback_remote_test__'

let admin: SeedUser
let feedbackId = 0

beforeAll(async () => {
  if (!reachable) return
  admin = (await seedUsers({ admin: 'admin@grnyte.rocks' })).admin
})

beforeEach(async () => {
  if (!reachable) return
  vi.mocked(sendEmailOutcome).mockReset()
  await sql`delete from public.feedback where body = ${BODY}`
  const [row] = await sql<{ id: number }[]>`
    insert into public.feedback (body, kind, created_by)
    values (${BODY}, 'idea', ${admin.userId}) returning id`
  feedbackId = row.id
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.feedback where body = ${BODY}`
})

const rowNow = async () => {
  const [row] = await sql<{ reply: null | string; status: string }[]>`
    select reply, status from public.feedback where id = ${feedbackId}`
  return row
}

describe.skipIf(!reachable)('replyToFeedback', () => {
  it('reopens the row when the mail fails, so the admin can answer again', async () => {
    vi.mocked(sendEmailOutcome).mockResolvedValueOnce('retry')
    const first = await asRequest(admin.authId, () => replyToFeedback({ id: feedbackId, reply: 'first try' }))
    expect(first.delivered).toBe(false)
    // The text stays, so a reload or another device can send it again.
    expect(await rowNow()).toEqual({ reply: 'first try', status: 'open' })

    vi.mocked(sendEmailOutcome).mockResolvedValueOnce('sent')
    const second = await asRequest(admin.authId, () => replyToFeedback({ id: feedbackId, reply: 'second try' }))
    expect(second.delivered).toBe(true)
    expect(await rowNow()).toEqual({ reply: 'second try', status: 'closed' })
  })

  it('resends the same answer under the same key, so a send that did go out stays one mail', async () => {
    vi.mocked(sendEmailOutcome).mockResolvedValueOnce('retry')
    await asRequest(admin.authId, () => replyToFeedback({ id: feedbackId, reply: 'same text' }))
    vi.mocked(sendEmailOutcome).mockResolvedValueOnce('sent')
    await asRequest(admin.authId, () => replyToFeedback({ id: feedbackId, reply: 'same text' }))

    const [first, retry] = vi.mocked(sendEmailOutcome).mock.calls.map(([input]) => input.idempotencyKey)
    expect(retry).toBe(first)
  })

  it('keeps the row closed when the mail can never go out', async () => {
    // A malformed address or no mail key: reopening would leave a row nobody can ever close.
    vi.mocked(sendEmailOutcome).mockResolvedValueOnce('failed')
    const reply = await asRequest(admin.authId, () => replyToFeedback({ id: feedbackId, reply: 'bad address' }))
    expect(reply.delivered).toBe(false)
    expect(await rowNow()).toEqual({ reply: 'bad address', status: 'closed' })
  })

  it('keeps the row closed once the mail went out', async () => {
    vi.mocked(sendEmailOutcome).mockResolvedValueOnce('sent')
    await asRequest(admin.authId, () => replyToFeedback({ id: feedbackId, reply: 'done' }))
    expect(await rowNow()).toEqual({ reply: 'done', status: 'closed' })
  })
})

describe.skipIf(!reachable)('listFeedback', () => {
  it('keeps a report whose author deleted their account, credited to nobody', async () => {
    await sql`update public.feedback set created_by = null where id = ${feedbackId}`

    const rows = await asRequest(admin.authId, () => listFeedback())

    expect(rows.find((row) => row.id === feedbackId)?.authorName).toBe('Deleted user')
  })
})
