import { db } from '$lib/db/db.server'
/**
 * `toEvent` over real synced rows.
 *
 * What is worth asserting here is an absence: the entity is resolved for every row, from the row
 * itself. The hydration pass this replaces could return a skeleton (not synced yet) or a tombstone
 * (synced, gone), and every consumer had to handle three states. One query means the first cannot
 * happen, and soft delete means the second still answers with a name.
 *
 * Skipped when DATABASE_URL is unreachable, so `npm test` still passes without a local stack.
 */
import { reachable, sql } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import type { QueryContext } from '$lib/zero/permissions'
import { queries } from '$lib/zero/queries'
import { schema } from '$lib/zero/zero-schema'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import { afterAll, describe, expect, it } from 'vitest'
import { eventRow } from './fixture'
import { objectOf, toEvent, type EventRow } from './mapper'

const zero = zeroPostgresJS(schema, sql as unknown as Parameters<typeof zeroPostgresJS>[1])

let ctx: (Omit<QueryContext, 'authUserId'> & { authUserId: string }) | undefined

if (reachable) {
  const [row] = await sql<{ authId: string }[]>`
    select u.auth_user_fk as "authId" from public.users u
    join public.region_members rm on rm.user_fk = u.id and rm.is_active
    join public.events e on e.region_fk = rm.region_fk
    limit 1`

  if (row != null) {
    ctx = { authUserId: row.authId, pageState: await getUserPermissions(db, row.authId) }
  }
}

const usable = reachable && ctx != null

afterAll(async () => {
  await sql.end()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors tenancy.test.ts
const run = (args: any): Promise<EventRow[]> =>
  zero.run(queries.listEvents.fn({ args, ctx: ctx! }) as never) as Promise<EventRow[]>

/** No membership needed: the crumb is only drawn for a reader who spans more than one region. */
const NO_REGIONS = [] as Parameters<typeof toEvent>[1]

describe.skipIf(!usable)('toEvent', () => {
  it('resolves an entity for every row, with no skeleton and no tombstone', async () => {
    const rows = await run({ limit: 200 })
    const mapped = rows.map((row) => toEvent(row, NO_REGIONS))

    expect(mapped.length).toBeGreaterThan(0)

    for (const event of mapped) {
      // `undefined` is allowed for exactly one case: a file, which has no page of its own.
      if (event.objectType === 'file') continue
      expect(event.entity, `event ${event.id} (${event.objectType})`).toBeDefined()
    }
  })

  it('names a soft-deleted entity rather than rendering it as gone', async () => {
    const [deleted] = await sql<{ id: number }[]>`
      select e.id from public.events e
      join public.routes r on r.id = e.route_fk
      where r.deleted_at is not null limit 1`

    if (deleted == null) return // nothing soft-deleted in this database

    const [row] = await run({ ids: [deleted.id], limit: 1 })
    // The ctx user and the soft-deleted route are picked by unrelated queries, so the event may
    // sit in a region this reader is not in, in which case the query rightly returns nothing.
    if (row == null) return

    const event = toEvent(row, NO_REGIONS)

    // The whole point of soft delete: the row is still there to render, so the card gets a real
    // route entity rather than the tombstone the old hydration pass would have produced. Not
    // asserted on the name, which the seed leaves empty on some rows: `row` and `href` are what
    // distinguish "resolved" from "gone".
    expect(event.entity?.row).toBe('route')
    expect(event.entity?.href).toBeTruthy()
    expect(event.entity?.route).toBeDefined()
  })

  it('gives an ascent its route row, not a zeroed one', async () => {
    const [row] = await run({ category: 'ascent', limit: 1 })
    if (row == null) return

    const event = toEvent(row, NO_REGIONS)

    // Reading grade and stars off the ascent would render a real route with zeroed values, which
    // is what `needs: ['route']` guarded against by waiting. Nothing waits now.
    expect(event.entity?.row).toBe('route')
    expect(event.entity?.route).toBeDefined()
    expect(event.entity?.ascentType).toBeTruthy()
  })

  it('reads the object off whichever of the six columns is set', async () => {
    const rows = await run({ limit: 200 })

    for (const row of rows) {
      const object = objectOf(row)
      expect(object).toBeDefined()
      // And it agrees with the mapped shape.
      const event = toEvent(row, NO_REGIONS)
      expect(event.objectType).toBe(object!.type)
      expect(event.objectId).toBe(object!.id)
    }
  })

  it('carries the diff, and leaves a change on the event object unqualified', async () => {
    const rows = await run({ category: 'update', limit: 200 })
    const withChanges = rows.map((row) => toEvent(row, NO_REGIONS)).filter((event) => event.changes.length > 0)

    expect(withChanges.length).toBeGreaterThan(0)
    for (const event of withChanges) {
      for (const change of event.changes) {
        expect(change.columnName).toBeTruthy()
        // Null object columns mean "the event's own object", which is the common path; a reorder
        // is what sets them.
        expect(change.objectType == null || change.objectType.length > 0).toBe(true)
      }
    }
  })
})

/**
 * The branches a live database cannot be relied on to contain. These need no DB and no skip guard,
 * which is the point: both naming bugs below were shipped because nothing could reach them.
 */
describe('entityOf, per branch', () => {
  it('gives a nameless block its Block N fallback rather than an empty headline', () => {
    const event = toEvent(
      eventRow({ block: { area: undefined, id: 3, name: '', order: 2, regionFk: 1 }, blockFk: 3 }),
      [],
    )

    // `blockName` is exported so the screen and the push digest cannot disagree; reading
    // `block.name` straight off the row put the empty string back.
    expect(event.entity?.name).toBe('Block 3')
    expect(event.entity?.row).toBe('block')
  })

  it('names an invitation by its address, not by the inviter it points at', () => {
    const invite = toEvent(
      eventRow({ metadata: 'lea@example.com', subject: { id: 7, username: 'jonas' }, subjectFk: 7, verb: 'invite' }),
      [],
    )
    // Both halves of the pair point `subject_fk` at the inviter, degenerately. Rendering the
    // subject would say "Jonas invited Jonas".
    const revoked = toEvent(
      eventRow({ metadata: 'lea@example.com', subject: { id: 7, username: 'jonas' }, subjectFk: 7, verb: 'remove' }),
      [],
    )

    expect(invite.entity?.name).toBe('lea@example.com')
    expect(revoked.entity?.name).toBe('lea@example.com')
    // No profile link for somebody with no account.
    expect(invite.entity?.row).toBe('none')
  })

  it('offers no profile link for somebody who just left the region', () => {
    const left = toEvent(eventRow({ subject: { id: 7, username: 'mara' }, subjectFk: 7, verb: 'leave' }), [])

    // Their profile is a dead end for a reader whose member list no longer holds them.
    expect(left.entity?.name).toBe('mara')
    expect(left.entity?.row).toBe('none')
    expect(left.entity?.href).toBeUndefined()
  })

  it('lets an upload borrow the entity it landed on, so the card can name it', () => {
    const event = toEvent(
      eventRow({
        file: {
          areaFk: null,
          ascentFk: null,
          block: { area: { name: 'Schwarzer Fels' }, areaFk: 9, id: 4, name: 'Nordblock', order: 0, regionFk: 1 },
          blockFk: 4,
          bunnyStreamFk: null,
          id: 'f1',
          path: '/x.jpg',
          regionFk: 1,
          routeFk: null,
        },
        fileFk: 'f1',
        verb: 'add',
      }),
      [],
    )

    // "added 5 photos to Nordblock" gets "Nordblock" from the parent, and draws its row.
    expect(event.entity?.name).toBe('Nordblock')
    expect(event.entity?.row).toBe('block')
    expect(event.entity?.files).toHaveLength(1)
    // And the parent is what grouping keys uploads on.
    expect(event.parent).toEqual({ id: 4, type: 'block' })
  })
})
