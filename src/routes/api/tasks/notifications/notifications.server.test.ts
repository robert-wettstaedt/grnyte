/**
 * A membership mail that could go out next time holds its row for the next run, for a day; one
 * that never will is stamped at once, like a sent one.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import type { SendOutcome } from '$lib/email/send.server'
import { notifyOutOfBand } from '$lib/entities/notification/notification.server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './+server'

let removed: SeedUser
let outcome: 'throw' | SendOutcome = 'sent'
const mailedTo: string[] = []
const mailOptions: unknown[] = []
const logged: string[] = []
vi.mock('$lib/logging/failure.server', () => ({
  logServerFailure: async (_source: string, message: string) => {
    logged.push(message)
  },
}))
// Anyone else's due row answers `retry`, so a run against a shared database leaves it alone.
vi.mock('$lib/email/send.server', () => ({
  sendEmailOutcome: async ({ to }: { to: string }, options: unknown) => {
    if (to !== removed.email) return 'retry'
    mailedTo.push(to)
    mailOptions.push(options)
    if (outcome === 'throw') throw new Error('template fault')
    return outcome
  },
}))
// Push off unless a case turns it on: then there is no digest and no push pass, and a run stamps
// only the mailed rows. One file, because tests in it run in turn and a run claims every due row.
let pushOn = false
const pushedTo: number[] = []
vi.mock('$lib/entities/notification/push.server', () => ({
  isPushConfigured: () => pushOn,
  sendPushToUser: async (_subscriptions: unknown, userFk: number) => {
    pushedTo.push(userFk)
    return true
  },
  subscriptionsFor: async () => new Map(),
}))
// The scan limits, lowered per case so a small backlog can exceed them.
let scanLimit = 1000
let digestLimit = 500
vi.mock('$lib/entities/notification/push', async (importOriginal) => {
  const real = await importOriginal<typeof import('$lib/entities/notification/push')>()
  return Object.defineProperties(
    { ...real },
    {
      DIGEST_SCAN_LIMIT: { enumerable: true, get: () => digestLimit },
      DIRECTED_SCAN_LIMIT: { enumerable: true, get: () => scanLimit },
    },
  )
})
// How many events each digest counted, in order.
const digestCounts: number[] = []
vi.mock('$lib/entities/notification/digest.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('$lib/entities/notification/digest.server')>()
  return {
    ...real,
    digestCopy: (events: Parameters<typeof real.digestCopy>[0], ...rest: unknown[]) => {
      digestCounts.push(events.length)
      return (real.digestCopy as (...args: unknown[]) => ReturnType<typeof real.digestCopy>)(events, ...rest)
    },
  }
})
// Holds each run's first query (the read of due rows) until both runs have made it, so the two
// genuinely read the same rows before either claims: the overlap a claim exists for.
let barrier: null | { arrived: number; open: () => void; opened: Promise<void> } = null
vi.mock('$lib/db/pinned.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('$lib/db/pinned.server')>()
  return {
    ...real,
    pinnedTx: (async (body) => {
      const result = await real.pinnedTx(body)
      if (barrier != null && barrier.arrived < 2) {
        barrier.arrived += 1
        if (barrier.arrived === 2) barrier.open()
        await barrier.opened
      }
      return result
    }) as typeof real.pinnedTx,
  }
})
vi.mock('$lib/entities/notification/errorAlert.server', () => ({ alertOnNewErrors: async () => 0 }))
vi.mock('$lib/remote/cron.server', () => ({ isCronAuthorized: () => true }))

let regionId = 0
let actor: SeedUser

const run = () =>
  POST({
    request: new Request('http://localhost/api/tasks/notifications', { method: 'POST' }),
    url: new URL('http://localhost/api/tasks/notifications'),
  } as never)

/** The fixture row, backdated past the debounce by `ageMs`. */
const seedRow = async (ageMs: number) => {
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await notifyOutOfBand({
    actorFk: actor.userId,
    regionFk: regionId,
    sourceType: 'membership_removed',
    userFk: removed.userId,
  })
  await sql`update public.notifications set created_at = now() - make_interval(secs => ${ageMs / 1000})
    where region_fk = ${regionId}`
}

const pushedAt = async () =>
  (await sql<{ pushed_at: Date | null }[]>`select pushed_at from public.notifications where region_fk = ${regionId}`)[0]
    ?.pushed_at

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion('__task_notifications_region__', 'region_admin')
  regionId = seeded.regionId
  actor = seeded.user
  removed = await createThrowawayUser('task_notifications')
})

beforeEach(() => {
  mailedTo.length = 0
  mailOptions.length = 0
  logged.length = 0
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  await dropThrowawayUser(removed)
})

describe.skipIf(!reachable)('POST /api/tasks/notifications, membership mail', () => {
  it('stamps a row whose mail went out', async () => {
    outcome = 'sent'
    await seedRow(10 * 60 * 1000)
    await run()
    expect(mailedTo).toEqual([removed.email])
    expect(await pushedAt()).toBeInstanceOf(Date)
  })

  it('stamps a row whose mail can never go out, rather than retrying it all day', async () => {
    outcome = 'failed'
    await seedRow(10 * 60 * 1000)
    await run()
    expect(mailedTo).toEqual([removed.email])
    expect(await pushedAt()).toBeInstanceOf(Date)
  })

  it('stamps a row whose mail threw, since a code fault would only repeat', async () => {
    outcome = 'throw'
    await seedRow(10 * 60 * 1000)
    await run()
    expect(await pushedAt()).toBeInstanceOf(Date)
  })

  it('leaves a row whose mail could go out next time for the next run', async () => {
    outcome = 'retry'
    await seedRow(10 * 60 * 1000)
    await run()
    expect(mailedTo).toEqual([removed.email])
    expect(await pushedAt()).toBeNull()
    // Quiet while it retries, so a day of ticks is not a day of log rows.
    expect(mailOptions).toEqual([{ quietRetry: true }])
    expect(logged.filter((line) => line.startsWith('gave up'))).toEqual([])
  })

  it('works through a backlog larger than one claim slice', async () => {
    outcome = 'sent'
    await sql`delete from public.notifications where region_fk = ${regionId}`
    // 150 rows past the debounce, kept distinct by an event each (it is part of the source key).
    await sql`
      with e as (
        insert into public.events (region_fk, actor_fk, verb, subject_fk)
        select ${regionId}, ${actor.userId}, 'remove', ${removed.userId} from generate_series(1, 150)
        returning id
      )
      insert into public.notifications (actor_fk, auth_user_fk, region_fk, source_type, user_fk, event_fk, created_at)
      select ${actor.userId}, ${removed.authId}, ${regionId}, 'membership_removed', ${removed.userId}, e.id,
        now() - interval '10 minutes'
      from e`

    await run()

    expect(mailedTo).toHaveLength(150)
    const [{ left }] = await sql<{ left: number }[]>`
      select count(*)::int as left from public.notifications where region_fk = ${regionId} and pushed_at is null`
    expect(left).toBe(0)
    await sql`delete from public.notifications where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId} and verb = 'remove'`
  })

  it('reports how many directed pushes it sent', async () => {
    outcome = 'sent'
    pushOn = true
    await sql`delete from public.notifications where region_fk = ${regionId}`
    await sql`
      with e as (
        insert into public.events (region_fk, actor_fk, verb, subject_fk)
        select ${regionId}, ${actor.userId}, 'remove', ${removed.userId} from generate_series(1, 3)
        returning id
      )
      insert into public.notifications (actor_fk, auth_user_fk, region_fk, source_type, user_fk, event_fk, created_at)
      select ${actor.userId}, ${removed.authId}, ${regionId}, 'membership_removed', ${removed.userId}, e.id,
        now() - interval '10 minutes'
      from e`
    try {
      const body = (await (await run()).json()) as { directed: number }
      expect(body.directed).toBe(3)
    } finally {
      pushOn = false
      await sql`delete from public.notifications where region_fk = ${regionId}`
      await sql`delete from public.events where region_fk = ${regionId} and verb = 'remove'`
    }
  })

  it('reads at most the scan limit per run, oldest first, leaving fresh rows unread by the run', async () => {
    outcome = 'sent'
    scanLimit = 120
    await sql`delete from public.notifications where region_fk = ${regionId}`
    // 150 due rows, one second apart so "oldest" is well defined, plus one inside the debounce.
    await sql`
      with e as (
        insert into public.events (region_fk, actor_fk, verb, subject_fk)
        select ${regionId}, ${actor.userId}, 'remove', ${removed.userId} from generate_series(1, 151)
        returning id
      ), numbered as (select id, row_number() over (order by id) as n from e)
      insert into public.notifications (actor_fk, auth_user_fk, region_fk, source_type, user_fk, event_fk, created_at)
      select ${actor.userId}, ${removed.authId}, ${regionId}, 'membership_removed', ${removed.userId}, id,
        case when n = 151 then now() else now() - interval '10 minutes' + make_interval(secs => n) end
      from numbered`

    try {
      await run()
      expect(mailedTo).toHaveLength(120)
      const [left] = await sql<{ n: number; newest: number }[]>`
        select count(*)::int as n,
          count(*) filter (where created_at < now() - interval '10 minutes' + interval '120500 milliseconds')::int as newest
        from public.notifications where region_fk = ${regionId} and pushed_at is null`
      expect(left.n).toBe(31)
      // The 120 oldest went; nothing older than the 121st is left behind.
      expect(left.newest).toBe(0)

      // The next run drains the rest of what is due and still skips the fresh row.
      mailedTo.length = 0
      await run()
      expect(mailedTo).toHaveLength(30)
    } finally {
      scanLimit = 1000
      await sql`delete from public.notifications where region_fk = ${regionId}`
      await sql`delete from public.events where region_fk = ${regionId} and verb = 'remove'`
    }
  })

  it('mails a row once when two runs overlap', async () => {
    outcome = 'sent'
    await seedRow(10 * 60 * 1000)
    let open = () => {}
    const opened = new Promise<void>((resolve) => (open = resolve))
    barrier = { arrived: 0, open, opened }
    await Promise.all([run(), run()]).finally(() => (barrier = null))
    expect(mailedTo).toEqual([removed.email])
    expect(await pushedAt()).toBeInstanceOf(Date)
  })

  it('gives up after a day, logging that once, so an outage cannot keep a row forever', async () => {
    outcome = 'retry'
    await seedRow(25 * 60 * 60 * 1000)
    await run()
    expect(await pushedAt()).toBeInstanceOf(Date)
    expect(logged.filter((line) => line.startsWith('gave up'))).toHaveLength(1)
  })
})

describe.skipIf(!reachable)('POST /api/tasks/notifications, digest', () => {
  let reader: SeedUser

  beforeAll(async () => {
    if (!reachable) return
    reader = await createThrowawayUser('task_notifications_digest')
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${regionId}, ${reader.userId}, ${reader.authId}, 'region_user', true)`
    await sql`
      insert into public.user_settings (auth_user_fk, user_fk, pushed_up_to_event_at, notify_guidebook_edits)
      values (${reader.authId}, ${reader.userId}, now() - interval '1 hour', true)`
    await sql`
      insert into public.push_subscriptions (auth_user_fk, user_fk, endpoint, p256dh, auth)
      values (${reader.authId}, ${reader.userId}, 'https://push.example.test/digest-overlap', 'key', 'secret')`
    const [area] = await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by)
      values ('__task_notifications_area__', 'sector', ${regionId}, ${actor.userId}) returning id`
    const [block] = await sql<{ id: number }[]>`
      insert into public.blocks (name, area_fk, region_fk, created_by, "order")
      values ('__task_notifications_block__', ${area.id}, ${regionId}, ${actor.userId}, 0) returning id`
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__task_notifications_route__', ${block.id}, ${regionId}, ${actor.userId}) returning id`
    // Past the quiet period, so the digest is due on the first run.
    await sql`
      insert into public.events (region_fk, actor_fk, verb, route_fk, created_at)
      values (${regionId}, ${actor.userId}, 'create', ${route.id}, now() - interval '30 minutes')`
  })

  afterAll(async () => {
    if (!reachable) return
    pushOn = false
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.push_subscriptions where user_fk = ${reader.userId}`
    await sql`delete from public.user_settings where user_fk = ${reader.userId}`
    await sql`delete from public.region_members where user_fk = ${reader.userId}`
    await dropThrowawayUser(reader)
  })

  it('pushes a due digest once when two runs overlap', async () => {
    pushOn = true
    pushedTo.length = 0
    await Promise.all([run(), run()])
    expect(pushedTo.filter((userFk) => userFk === reader.userId)).toHaveLength(1)
  })

  it('counts each event once when a truncated scan defers the events sharing its last timestamp', async () => {
    pushOn = true
    digestLimit = 3
    digestCounts.length = 0
    const [{ id: routeId }] = await sql<{ id: number }[]>`
      select id from public.routes where name = '__task_notifications_route__' and region_fk = ${regionId}`
    await sql`update public.user_settings set pushed_up_to_event_at = now() - interval '1 hour' where user_fk = ${reader.userId}`
    await sql`
      insert into public.events (region_fk, actor_fk, verb, route_fk, created_at)
      values (${regionId}, ${actor.userId}, 'update', ${routeId}, now() - interval '29 minutes')`
    // One statement, so the three share one timestamp exactly.
    await sql`
      insert into public.events (region_fk, actor_fk, verb, route_fk, created_at)
      select ${regionId}, ${actor.userId}, 'update', ${routeId}, now() - interval '28 minutes' from generate_series(1, 3)`
    const sent: number[] = []
    try {
      for (let i = 0; i < 2; i++) sent.push(((await (await run()).json()) as { digests: number }).digests)
    } finally {
      digestLimit = 500
    }
    expect(sent).toEqual([1, 1])
    // Five events: the first run stops short of the three it cannot finish, the second takes them.
    expect(digestCounts).toEqual([2, 3])
  })
})
