/**
 * `recordAccolades` is best effort on the CALLER's transaction: a failed statement there would abort
 * it, and the ascent log with it. A held lock plus a short `lock_timeout` makes the sync fail for real.
 */
import * as schema from '$lib/db/schema'
import { reachable, sql } from '$lib/db/testDb'
import { sql as q } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { recordAccolades } from './accolade.server'

vi.mock('$lib/logging/failure.server', () => ({ logServerFailure: vi.fn(async () => undefined) }))
const { logServerFailure } = await import('$lib/logging/failure.server')

const db = drizzle(sql, { schema })

afterAll(async () => {
  await sql.end()
})

describe.skipIf(!reachable)('recordAccolades', () => {
  it('leaves the caller transaction usable when the sync fails', async () => {
    const blocker = await sql.reserve()
    await blocker`begin`
    await blocker`lock table public.ascents in access exclusive mode`
    try {
      const after = await db.transaction(async (tx) => {
        await tx.execute(q`set local lock_timeout = '50ms'`)
        await recordAccolades(tx, { createdBy: 1, routeFk: 1 }, 1)
        // The caller's next statement, standing in for `insertEvent`.
        return [...(await tx.execute(q`select 1 as one`))]
      })

      expect(after).toEqual([{ one: 1 }])
      expect(logServerFailure).toHaveBeenCalledOnce()
    } finally {
      await blocker`rollback`
      blocker.release()
    }
  })
})
