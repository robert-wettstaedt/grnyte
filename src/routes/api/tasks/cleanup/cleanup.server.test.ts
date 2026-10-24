/**
 * The staging sweep reads every page of the listing: `list` stops at its limit without saying so,
 * and stale uploads past the first page were never removed.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, sql } from '$lib/db/testDb'
import { ERASED_COMMENT } from '$lib/entities/user/delete.server'
import { describe, expect, it, vi } from 'vitest'
import { POST } from './+server'

const DAY = 24 * 60 * 60 * 1000
const FRESH = 1200
const STALE = 300

// One uid folder; its objects sorted by name the way storage lists them, the stale ones last.
const objects = [
  ...Array.from({ length: FRESH }, (_, i) => ({
    created_at: new Date().toISOString(),
    id: `a${i}`,
    name: `a-${String(i).padStart(5, '0')}.jpg`,
  })),
  ...Array.from({ length: STALE }, (_, i) => ({
    created_at: new Date(Date.now() - 2 * DAY).toISOString(),
    id: `z${i}`,
    name: `z-${String(i).padStart(5, '0')}.jpg`,
  })),
]
const removed: string[] = []

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    storage: {
      from: () => ({
        list: async (prefix?: string, { limit = 100, offset = 0 } = {}) => ({
          data: (prefix == null ? [{ id: null, name: 'uid-1' }] : objects).slice(offset, offset + limit),
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths)
          return { data: [], error: null }
        },
      }),
    },
  }),
}))
vi.mock('$lib/remote/cron.server', () => ({ isCronAuthorized: () => true }))
vi.mock('$lib/videos/provider.server', () => ({
  getVideoProvider: () => ({ deleteVideo: async () => {}, listStaleUploads: async () => [] }),
}))
vi.mock('$lib/entities/file/cleanup.server', () => ({ reportBunnyOrphans: async () => {} }))
vi.mock('$lib/entities/file/readiness.server', () => ({ reconcileReadiness: async () => 0 }))
vi.mock('$lib/entities/user/unconfirmed.server', () => ({
  sweepUnconfirmedAccounts: async () => 0,
  UNCONFIRMED_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
}))

describe.skipIf(!reachable)('POST /api/tasks/cleanup, staging', () => {
  it('removes stale uploads beyond the first page of the listing', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/tasks/cleanup', { method: 'POST' }),
      url: new URL('http://localhost/api/tasks/cleanup'),
    } as never)

    expect(response.status).toBe(200)
    expect(removed).toHaveLength(STALE)
    expect(removed.every((path) => path.startsWith('uid-1/z-'))).toBe(true)
  })
})

describe.skipIf(!reachable)('POST /api/tasks/cleanup, moderation decisions', () => {
  it('deletes a decision older than three years and keeps a younger one', async () => {
    const decision = (age: string) => sql<{ id: number }[]>`
      insert into public.moderation_decisions (ground, reason, object_type, object_id, created_at)
      values ('spam', '__cleanup_decision__', 'route', 1, now() - ${age}::interval) returning id`
    const [[old], [young]] = await Promise.all([decision('3 years 1 day'), decision('2 years 360 days')])

    try {
      await POST({
        request: new Request('http://localhost/api/tasks/cleanup', { method: 'POST' }),
        url: new URL('http://localhost/api/tasks/cleanup'),
      } as never)

      expect(await sql`select id from public.moderation_decisions where id in (${old.id}, ${young.id})`).toEqual([
        { id: young.id },
      ])
    } finally {
      await sql`delete from public.moderation_decisions where reason = '__cleanup_decision__'`
    }
  })
})

describe.skipIf(!reachable)('POST /api/tasks/cleanup, deleted comments', () => {
  it('ends the undo of a comment deleted more than a day ago, and keeps a fresher one', async () => {
    const author = await createThrowawayUser('cleanup_comment')
    const [region] = await sql<{ id: number }[]>`
      insert into public.regions (name, created_by) values ('__cleanup_comments__', ${author.userId}) returning id`
    const [event] = await sql<{ id: number }[]>`
      insert into public.events (verb, actor_fk, region_fk, subject_fk)
      values ('join', ${author.userId}, ${region.id}, ${author.userId}) returning id`
    // A delete as the app leaves it: a blank, authorless row, its words kept aside for the undo.
    const comment = async (body: string, age: string) => {
      const [row] = await sql<{ id: number }[]>`
        insert into public.reactions (event_fk, body, type, region_fk, deleted_at, removed_by)
        values (${event.id}, ${ERASED_COMMENT}, 'comment', ${region.id}, now() - ${age}::interval, 'author') returning id`
      await sql`
        insert into public.deleted_comments (reaction_fk, body, user_fk, created_at)
        values (${row.id}, ${body}, ${author.userId}, now() - ${age}::interval)`
      return row
    }
    const old = await comment('old words', '25 hours')
    const fresh = await comment('fresh words', '1 hour')

    try {
      await POST({
        request: new Request('http://localhost/api/tasks/cleanup', { method: 'POST' }),
        url: new URL('http://localhost/api/tasks/cleanup'),
      } as never)

      expect(
        await sql`select reaction_fk, body from public.deleted_comments where reaction_fk in (${old.id}, ${fresh.id})`,
      ).toEqual([{ body: 'fresh words', reaction_fk: fresh.id }])
    } finally {
      await sql`delete from public.reactions where region_fk = ${region.id}`
      await sql`delete from public.events where region_fk = ${region.id}`
      await sql`delete from public.regions where id = ${region.id}`
      await dropThrowawayUser(author)
    }
  })
})
