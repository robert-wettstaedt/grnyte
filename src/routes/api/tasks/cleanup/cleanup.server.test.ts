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

const runCleanup = () =>
  POST({
    request: new Request('http://localhost/api/tasks/cleanup', { method: 'POST' }),
    url: new URL('http://localhost/api/tasks/cleanup'),
  } as never)

describe.skipIf(!reachable)('POST /api/tasks/cleanup, staging', () => {
  it('removes stale uploads beyond the first page of the listing', async () => {
    const response = await runCleanup()

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
      await runCleanup()

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
      await runCleanup()

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

describe.skipIf(!reachable)('POST /api/tasks/cleanup, auth logs', () => {
  it('drops both auth logs past 90 days and code counters untouched for a day, and keeps younger rows', async () => {
    const tag = `__cleanup_auth_${crypto.randomUUID().slice(0, 8)}__`
    const event = (age: string) => sql`
      insert into public.auth_events (kind, detail, created_at) values ('mail_quota', ${sql.json({ tag })}, now() - ${age}::interval)`
    const audit = (age: string) => sql`
      insert into auth.audit_log_entries (id, payload, created_at)
      values (gen_random_uuid(), ${sql.json({ age, tag })}, now() - ${age}::interval)`
    const attempt = (subject: string, age: string) => sql`
      insert into public.auth_code_attempts (subject, kind, tries, window_started_at)
      values (${subject}, 'signup', 1, now() - ${age}::interval)`
    await Promise.all([
      event('91 days'),
      event('89 days'),
      audit('91 days'),
      audit('89 days'),
      attempt(`${tag}old`, '25 hours'),
      attempt(`${tag}young`, '1 hour'),
    ])

    try {
      await runCleanup()

      expect(await sql`select count(*)::int as n from public.auth_events where detail->>'tag' = ${tag}`).toEqual([
        { n: 1 },
      ])
      expect(
        await sql`select payload->>'age' as age from auth.audit_log_entries where payload->>'tag' = ${tag}`,
      ).toEqual([{ age: '89 days' }])
      expect(await sql`select subject from public.auth_code_attempts where subject like ${`${tag}%`}`).toEqual([
        { subject: `${tag}young` },
      ])
    } finally {
      await sql`delete from public.auth_events where detail->>'tag' = ${tag}`
      await sql`delete from auth.audit_log_entries where payload->>'tag' = ${tag}`
      await sql`delete from public.auth_code_attempts where subject like ${`${tag}%`}`
    }
  })

  it('drops re-auth codes and grants a day past their expiry, and keeps fresher ones', async () => {
    const user = await createThrowawayUser('cleanup_reauth')
    const session = crypto.randomUUID()
    const challenge = (target: string, expired: string) => sql`
      insert into public.reauth_challenges (auth_user_fk, session_id, action, target, code_hash, expires_at)
      values (${user.authId}, ${session}, 'account.delete', ${target}, 'hash', now() - ${expired}::interval)`
    const grant = (target: string, expired: string) => sql`
      insert into public.reauth_grants (auth_user_fk, session_id, action, target, method, expires_at)
      values (${user.authId}, ${session}, 'account.delete', ${target}, 'email_code', now() - ${expired}::interval)`
    await Promise.all([
      challenge('old', '25 hours'),
      challenge('recent', '1 hour'),
      grant('old', '25 hours'),
      grant('live', '-5 minutes'),
    ])

    try {
      await runCleanup()

      expect(await sql`select target from public.reauth_challenges where auth_user_fk = ${user.authId}`).toEqual([
        { target: 'recent' },
      ])
      expect(await sql`select target from public.reauth_grants where auth_user_fk = ${user.authId}`).toEqual([
        { target: 'live' },
      ])
    } finally {
      await dropThrowawayUser(user)
    }
  })
})

describe.skipIf(!reachable)('POST /api/tasks/cleanup, app sign-in flows', () => {
  it('drops a flow 61 minutes past its expiry and keeps one 59 minutes past', async () => {
    const tag = `__cleanup_handoff_${crypto.randomUUID().slice(0, 8)}__`
    const flow = (age: string) => sql`
      insert into public.app_auth_flows (purpose, provider, client_hash, expires_at)
      values ('signin', 'google', ${tag + age}, now() - ${age}::interval)`
    await Promise.all([flow('61 minutes'), flow('59 minutes')])

    try {
      await runCleanup()

      expect(await sql`select client_hash from public.app_auth_flows where client_hash like ${`${tag}%`}`).toEqual([
        { client_hash: `${tag}59 minutes` },
      ])
    } finally {
      await sql`delete from public.app_auth_flows where client_hash like ${`${tag}%`}`
    }
  })
})

describe.skipIf(!reachable)('POST /api/tasks/cleanup, recorded writes', () => {
  it('drops one older than 30 days, counts it, and keeps a younger one', async () => {
    const user = await createThrowawayUser('cleanup_writes')
    const write = (id: string, age: string) => sql`
      insert into public.applied_writes (id, auth_user_fk, name, created_at)
      values (${user.authId + id}, ${user.authId}, 'favorites.set', now() - ${age}::interval)`
    await Promise.all([write('old', '31 days'), write('young', '29 days')])

    try {
      const response = await runCleanup()

      expect((await response.json()).appliedWrites).toBe(1)
      expect(await sql`select id from public.applied_writes where auth_user_fk = ${user.authId}`).toEqual([
        { id: `${user.authId}young` },
      ])
    } finally {
      await dropThrowawayUser(user)
    }
  })
})
