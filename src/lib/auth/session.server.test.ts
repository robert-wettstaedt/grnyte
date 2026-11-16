// @vitest-environment node
import { db } from '$lib/db/db.server'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { formError } from '$lib/forms/schemas'
import { withLocals } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { isSessionLive, requireLiveSession } from './session.server'

let user: SeedUser

beforeAll(async () => {
  if (!reachable) return
  user = await createThrowawayUser('session-live')
})
afterAll(async () => {
  if (reachable) await dropThrowawayUser(user)
})

const newSession = async (createdAt = 'now()') =>
  (
    await sql<{ id: string }[]>`
      insert into auth.sessions (user_id, created_at) values (${user.authId}, ${sql.unsafe(createdAt)}) returning id`
  )[0].id

const failingDb = { execute: () => Promise.reject(new Error('pooler down')) } as never

describe.skipIf(!reachable)('isSessionLive', () => {
  it('answers not live once the session row is gone', async () => {
    const id = await newSession()
    await sql`delete from auth.sessions where id = ${id}`
    expect(await isSessionLive(db, { session_id: id, sub: user.authId })).toBe(false)
  })

  it('answers live for a session signed in a year ago', async () => {
    const id = await newSession(`now() - interval '1 year'`)
    expect(await isSessionLive(db, { session_id: id, sub: user.authId })).toBe(true)
  })

  it('throws when the read fails, never answering not live', async () => {
    await expect(isSessionLive(failingDb, { session_id: crypto.randomUUID(), sub: user.authId })).rejects.toThrow()
  })
})

describe.skipIf(!reachable)('requireLiveSession', () => {
  const run = async (locals: object) => {
    try {
      await withLocals(locals, () => requireLiveSession())
      return undefined
    } catch (thrown) {
      return thrown as { body?: unknown; status?: number }
    }
  }

  it('answers 503 and signs nothing out when the read fails', async () => {
    const signOut = vi.fn()
    // Postgres refuses a malformed uuid, so the read itself throws.
    const thrown = await run({
      backendUnavailable: false,
      claims: { session_id: 'not-a-uuid', sub: user.authId },
      supabase: { auth: { signOut } },
    })

    expect(thrown).toMatchObject({ body: { message: formError('auth_serviceUnavailable') }, status: 503 })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('refuses a deleted session 401 and clears its cookies', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    const id = await newSession()
    await sql`delete from auth.sessions where id = ${id}`

    const thrown = await run({
      backendUnavailable: false,
      claims: { session_id: id, sub: user.authId },
      supabase: { auth: { signOut } },
    })

    expect(thrown).toMatchObject({ body: { message: formError('auth_sessionEnded') }, status: 401 })
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('answers 503 for a backend outage without reading or signing out', async () => {
    const signOut = vi.fn()
    const thrown = await run({ backendUnavailable: true, claims: undefined, supabase: { auth: { signOut } } })

    expect(thrown).toMatchObject({ body: { message: formError('auth_serviceUnavailable') }, status: 503 })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('lets a live session through', async () => {
    const id = await newSession()
    expect(await run({ backendUnavailable: false, claims: { session_id: id, sub: user.authId } })).toBeUndefined()
  })
})
