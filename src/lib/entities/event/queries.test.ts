/**
 * `listEvents` against the real database, run the way zero-cache runs it.
 *
 * The claim worth testing is the one the whole read-path rewrite rests on: the object arrives
 * NESTED, in one query, so nothing downstream has to collect ids and join them in memory. A unit
 * test with a fake cannot show that, because what it would assert is that we called drizzle in a
 * particular order rather than that Zero resolved six optional relations against real rows.
 *
 * Skipped when DATABASE_URL is unreachable, so `npm test` still passes without a local stack.
 */
import { db } from '$lib/db/db.server'
import { reachable, sql } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import type { QueryContext } from '$lib/zero/permissions'
import { queries } from '$lib/zero/queries'
import { schema } from '$lib/zero/zero-schema'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import { afterAll, describe, expect, it } from 'vitest'

// Same cast `tenancy.test.ts` uses: the postgres.js generic does not line up with what
// Zero's adapter declares, and the mismatch is purely nominal.
const zero = zeroPostgresJS(schema, sql as unknown as Parameters<typeof zeroPostgresJS>[1])

// `authUserId` narrowed to a string: `regionMemberCan` refuses an anonymous context, and the
// guard below means we never build one.
let ctx: (Omit<QueryContext, 'authUserId'> & { authUserId: string }) | undefined

if (reachable) {
  // Whoever the seed made an admin: this only needs somebody who can read a region with events.
  const [row] = await sql<{ authId: string }[]>`
    select u.auth_user_fk as "authId" from public.users u
    join public.region_members rm on rm.user_fk = u.id and rm.is_active
    join public.events e on e.region_fk = rm.region_fk
    limit 1`

  if (row != null) {
    ctx = { authUserId: row.authId, pageState: await getUserPermissions(db, row.authId) }
  }
}

/**
 * A region `event.server.test.ts` does not touch, and the ONLY region these tests read.
 *
 * Vitest runs files in parallel, and that file inserts and deletes events on the first live route
 * between every case. These tests read the whole log, so a row appearing or vanishing mid-assertion
 * reads as a failure with nothing actually wrong. Both files pick deterministically, so pinning
 * this one to a different region removes the overlap rather than tolerating it.
 */
let region = 0

if (reachable) {
  const [busy] = await sql<{ regionFk: number }[]>`
    select region_fk as "regionFk" from public.routes where deleted_at is null order by id limit 1`
  const [own] = await sql<{ regionFk: number }[]>`
    select region_fk as "regionFk" from public.events
    where region_fk is distinct from ${busy?.regionFk ?? 0}
    group by region_fk order by count(*) desc limit 1`
  region = own?.regionFk ?? 0
}

const usable = reachable && ctx != null && region !== 0

afterAll(async () => {
  await sql.end()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- every caller asserts the shape it wants
type Row = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto, mirroring tenancy.test.ts
const run = (args: any): Promise<Row[]> =>
  zero.run(queries.listEvents.fn({ args: { regionFk: region, ...args }, ctx: ctx! }) as never) as Promise<Row[]>

/** Above any plausible row count, so a limit never truncates a set an assertion compares. */
const ALL_ROWS = 5000

describe.skipIf(!usable)('listEvents', () => {
  it('brings the object back nested, so nothing has to hydrate it', async () => {
    const rows = await run({ limit: 200 })
    expect(rows.length).toBeGreaterThan(0)

    // Exactly one object per row, which is `events_one_object` seen from the read side.
    for (const row of rows) {
      const objects = [row.area, row.ascent, row.block, row.file, row.route, row.subject].filter((o) => o != null)
      expect(objects).toHaveLength(1)
    }

    // And the actor, which every headline needs.
    expect(rows.every((row) => row.actor != null)).toBe(true)
  })

  it('resolves the second and third hop an ascent card needs', async () => {
    const [ascentEvent] = await run({ category: 'ascent', limit: 1 })

    if (ascentEvent == null) return // no ascent events in this database

    // The wave that used to arrive separately, and the reason a tombstone could flash.
    expect(ascentEvent.ascent).not.toBeNull()
    expect(ascentEvent.ascent.route).not.toBeNull()
    expect(ascentEvent.ascent.route.block).not.toBeNull()
  })

  it('splits the segmented control on whether the object is an ascent', async () => {
    // Above the row count on purpose: the partition check below compares totals, and a limit
    // that truncates either half turns a real mismatch into an unread one.
    const [ascents, updates] = await Promise.all([
      run({ category: 'ascent', limit: ALL_ROWS }),
      run({ category: 'update', limit: ALL_ROWS }),
    ])

    // An ascent card is an event about an ascent that is not a media removal. Removing a photo
    // logs on the parent (the file row is gone by then), so it arrives as `ascent` + `remove` and
    // belongs in updates: counting it as a send would inflate "sent 4 routes today".
    expect(ascents.every((row) => row.ascentFk != null && row.verb !== 'remove')).toBe(true)
    expect(updates.every((row) => row.ascentFk == null || row.verb === 'remove')).toBe(true)

    // And the two halves partition the log. Checked against ONE fetch rather than by comparing
    // three counts: `event.server.test.ts` writes and deletes events while this runs, so three
    // separate queries can legitimately disagree by a row without anything being wrong.
    const all = await run({ limit: ALL_ROWS })
    for (const row of all) {
      const inAscents = row.ascentFk != null && row.verb !== 'remove'
      const inUpdates = row.ascentFk == null || row.verb === 'remove'
      expect(inAscents !== inUpdates, `event ${row.id}`).toBe(true)
    }
  })

  it('carries the diff rows with the event', async () => {
    const rows = await run({ category: 'update', limit: 200 })
    const withChanges = rows.filter((row) => row.changes.length > 0)

    expect(withChanges.length).toBeGreaterThan(0)
    for (const row of withChanges) {
      expect(row.verb).toBe('update')
      expect(row.changes.every((change: { columnName: string }) => change.columnName != null)).toBe(true)
    }
  })

  it('scopes a log to events about an entity AND events whose changes name it', async () => {
    const [event] = (await run({ category: 'update', limit: ALL_ROWS })).filter((row) => row.routeFk != null)
    if (event?.routeFk == null) return

    const scoped = await run({ limit: ALL_ROWS, scope: { id: event.routeFk, type: 'route' } })

    // Not asserted non-empty. `event.server.test.ts` borrows a live route and deletes every event
    // on it between cases, so the row picked above can legitimately vanish mid-test. What is
    // always true, and what this is here for, is that nothing OUTSIDE the scope comes back.
    if (scoped.length === 0) return
    // Every row either IS about the route, or holds a change that names it. Nothing else.
    for (const row of scoped) {
      const named =
        row.routeFk === event.routeFk ||
        row.changes.some((change: { routeFk: null | number }) => change.routeFk === event.routeFk)
      expect(named).toBe(true)
    }
  })

  it('takes a scope id as text, which is how every caller states it', async () => {
    // The old log keyed on `entity_id text`, so every caller passes `String(id)` and still does.
    // Five of the six object columns are integers and Zero compares by value AND type, so an
    // uncoerced string matches nothing: every area, block and route log comes back empty.
    const [event] = (await run({ limit: ALL_ROWS })).filter((row) => row.routeFk != null)
    if (event?.routeFk == null) return

    const asText = await run({ limit: ALL_ROWS, scope: { id: String(event.routeFk), type: 'route' } })
    const asNumber = await run({ limit: ALL_ROWS, scope: { id: event.routeFk, type: 'route' } })

    expect(asText.map((row: { id: number }) => row.id)).toEqual(asNumber.map((row: { id: number }) => row.id))
    expect(asText.length).toBeGreaterThan(0)
  })

  it('takes a cuid for a file scope, the one object not keyed on a serial', async () => {
    const rows = await run({ limit: 200 })
    const withFile = rows.find((row) => row.fileFk != null)

    if (withFile == null) return // no upload events in this database

    const scoped = await run({ limit: 200, scope: { id: withFile.fileFk, type: 'file' } })

    expect(scoped.length).toBeGreaterThan(0)
    for (const row of scoped) {
      const named =
        row.fileFk === withFile.fileFk ||
        row.changes.some((change: { fileFk: null | string }) => change.fileFk === withFile.fileFk)
      expect(named).toBe(true)
    }
  })

  it('cuts the two windows on the sort key, so neither loses nor repeats a row', async () => {
    const rows = await run({ limit: 200 })

    if (rows.length < 3) return

    // The row the reader acknowledged, taken from the middle so both windows hold something.
    const index = Math.floor(rows.length / 2)
    const seen = rows[index]
    const cursor = { createdAt: seen.createdAt, id: seen.id }

    const [read, queued] = await Promise.all([run({ limit: 200, upTo: cursor }), run({ after: cursor, limit: 200 })])

    // Exactly the rows above the mark wait behind the "N new" pill, and the mark itself is read.
    // Cutting on the id instead put most of the log on the wrong side of both, because the ids do
    // not run with the timestamps the list is ordered by.
    expect(queued.map((row) => row.id)).toEqual(rows.slice(0, index).map((row) => row.id))
    expect(read.slice(0, rows.length - index).map((row) => row.id)).toEqual(rows.slice(index).map((row) => row.id))
  })

  it('syncs the same route tree under an ascent as at the top level', async () => {
    const [top] = (await run({ category: 'update', limit: ALL_ROWS })).filter((row) => row.route != null)
    const [asc] = (await run({ category: 'ascent', limit: ALL_ROWS })).filter((row) => row.ascent?.route != null)

    // Loud, not vacuous: this guard's whole job is catching drift, so a database that cannot
    // exercise it must fail rather than report green.
    expect(top, 'no update event with a route').toBeDefined()
    expect(asc, 'no ascent event whose ascent has a route').toBeDefined()

    // The drift that matters is a MISSING relation, so name them. A generic deep compare of the
    // two rows sounds stronger but is not: it compares value types, which differ legitimately
    // between two different routes (a null description reads as `object`, a set one as `string`).
    //
    // A shallow key compare is too weak the other way: dropping `.related('area')` from one copy
    // leaves `block` present on both sides, so it stays green while `blockName` and the crumbs
    // silently differ on that path, and the mapper's `RouteListRow` cast erases the type error.
    const relations = (route: Record<string, unknown>) => ({
      block: route.block != null,
      blockArea: (route.block as undefined | { area?: unknown })?.area != null,
      firstAscents: Array.isArray(route.firstAscents),
      tags: Array.isArray(route.tags),
      topoRoutes: Array.isArray(route.topoRoutes),
    })

    const nested = relations(asc.ascent!.route as unknown as Record<string, unknown>)
    expect(nested).toEqual(relations(top.route as unknown as Record<string, unknown>))
    // And that the tree is actually there, so the comparison is not two matching absences.
    expect(nested).toEqual({ block: true, blockArea: true, firstAscents: true, tags: true, topoRoutes: true })
  })

  it('orders newest first, which is what the feed pages on', async () => {
    const rows = await run({ limit: 50 })

    // By `createdAt`, with `id` only as a tiebreak. Ids are NOT monotonic with time here: the
    // backfill folded historical activity rows into events in island order, so an event carrying
    // a 2024 timestamp can have a higher id than one from 2026. The feed pages on the timestamp.
    const keys = rows.map((row) => [row.createdAt, row.id] as const)
    const sorted = [...keys].sort((a, b) => b[0] - a[0] || b[1] - a[1])
    expect(sorted).toEqual(keys)
  })
})
