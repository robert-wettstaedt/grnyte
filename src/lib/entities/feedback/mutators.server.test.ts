import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyAdminsOfFeedback } from './notify.server'

// `feedback.submit` on the privileged path: the row, who it is from, and the admin alert after commit.
vi.mock('./notify.server', () => ({ notifyAdminsOfFeedback: vi.fn(async () => {}) }))

const BODY = '__feedback_mutators_body__'

let reporter: SeedUser
let client: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  reporter = await createThrowawayUser('feedback_mutators')
  client = zeroClient(reporter.authId)
})

beforeEach(() => vi.mocked(notifyAdminsOfFeedback).mockClear())

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.feedback where created_by = ${reporter.userId}`
  await dropThrowawayUser(reporter)
})

describe.skipIf(!reachable)('feedback mutators', () => {
  it('records the report as the caller and alerts the admins once it has committed', async () => {
    const result = await client.push('feedback.submit', {
      body: BODY,
      createdBy: -1,
      kind: 'idea',
      pathname: '/explore',
      userAgent: '__feedback_mutators_agent__',
    })

    expect(result).toEqual({})
    const [row] = await sql<{ created_by: number; id: number; user_agent: string }[]>`
      select id, created_by, user_agent from public.feedback where body = ${BODY}`
    expect(row).toMatchObject({ created_by: reporter.userId, user_agent: '__feedback_mutators_agent__' })
    expect(notifyAdminsOfFeedback).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ feedbackFk: row.id, kind: 'idea', origin: expect.stringMatching(/^https?:\/\//) }),
    )
  })

  it('refuses a report too short to act on, and alerts nobody', async () => {
    const result = await client.push('feedback.submit', { body: 'short', kind: 'bug' })

    expect(result.error).toBe('app')
    expect(notifyAdminsOfFeedback).not.toHaveBeenCalled()
  })
})
