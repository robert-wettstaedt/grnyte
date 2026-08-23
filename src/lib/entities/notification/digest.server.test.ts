// @vitest-environment node
/**
 * The digest sentence, against a real database.
 *
 * This is the half of push that cannot be checked by looking at it: the claim is that the SAME
 * catalogue the feed card renders can be rendered server-side, per recipient, in that account's
 * language, from plain rows plus one `select id, name`. A mock would only assert that the code
 * calls the functions it calls; what is worth proving is that the sentence comes out whole, in
 * both locales, with the entity actually named.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { m } from '$lib/paraglide/messages'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { digestCopy, entityNames, type DigestEvent } from './digest.server'

const REGION_NAME = '__digest_test__'

let actor = {} as SeedUser
let regionId = 0
let areaId = 0
let blockId = 0
let routeId = 0
let ascentId = 0

const names = () => new Map([[actor.userId, 'Anna']])

/** An event row as the cron selects it, parent hops joined. */
const event = (over: Partial<DigestEvent> = {}): DigestEvent => ({
  actorFk: actor.userId,
  areaFk: null,
  ascentFk: null,
  ascentType: null,
  blockFk: null,
  createdAt: new Date('2026-08-01T10:00:00Z'),
  fileFk: null,
  id: 1,
  metadata: null,
  parentId: blockId,
  parentType: 'block',
  regionFk: regionId,
  routeFk: routeId,
  subjectFk: null,
  verb: 'create',
  ...over,
})

async function removeFixtures() {
  await sql`delete from public.ascents where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.routes where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.blocks where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.areas where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.regions where name = ${REGION_NAME}`
}

beforeAll(async () => {
  if (!reachable) return

  await removeFixtures()
  actor = await createThrowawayUser('digest')
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members)
    values (${REGION_NAME}, ${actor.userId}, 10) returning id`
  ;[{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type)
    values ('Klein Ilsetal', ${actor.userId}, ${regionId}, 'crag') returning id`
  ;[{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Nordblock', ${actor.userId}, ${regionId}, ${areaId}, 0) returning id`
  ;[{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk)
    values ('Kante direkt', ${actor.userId}, ${regionId}, ${blockId}) returning id`
  ;[{ id: ascentId }] = await sql<{ id: number }[]>`
    insert into public.ascents (type, created_by, region_fk, route_fk)
    values ('flash', ${actor.userId}, ${regionId}, ${routeId}) returning id`
})

afterAll(async () => {
  if (reachable) {
    await removeFixtures()
    await dropThrowawayUser(actor)
  }
  await sql.end()
})

describe.skipIf(!reachable)('entityNames', () => {
  it('resolves each kind off its own table', async () => {
    const resolved = await entityNames([
      { id: String(areaId), type: 'area' },
      { id: String(blockId), type: 'block' },
      { id: String(routeId), type: 'route' },
      { id: String(actor.userId), type: 'user' },
      { id: String(ascentId), type: 'ascent' },
    ])

    expect(resolved.get(`area:${areaId}`)).toBe('Klein Ilsetal')
    expect(resolved.get(`block:${blockId}`)).toBe('Nordblock')
    expect(resolved.get(`route:${routeId}`)).toBe('Kante direkt')
    expect(resolved.get(`user:${actor.userId}`)).toBe(actor.email)
    expect(resolved.get(`ascent:${ascentId}`)).toBe('Kante direkt')
  })

  it('asks nothing of an empty ref list', async () => {
    expect(await entityNames([])).toEqual(new Map())
  })

  // The polymorphic id is text, so a row can carry something that is not a number at all.
  it('ignores a ref whose id is not an id', async () => {
    expect(await entityNames([{ id: 'not-a-number', type: 'route' }])).toEqual(new Map())
  })
})

describe.skipIf(!reachable)('digestCopy', () => {
  it('has nothing to say about an empty batch', async () => {
    expect(await digestCopy([], names(), 'en')).toBeUndefined()
  })

  /**
   * The headline is the newest group's, rendered through the catalogue and naming the entity.
   *
   * Always the third person, which the exact title below pins: a digest can only ever contain
   * other people's activity (the query excludes the reader's own), so the "You added…" branch
   * must never be reachable from here.
   */
  it('renders the same sentence the feed card would, with the entity named', async () => {
    const copy = await digestCopy([event()], names(), 'en')

    expect(copy?.title).toBe('Anna added the route Kante direkt')
    // Nothing else queued, so nothing to count.
    expect(copy?.body).toBeUndefined()
  })

  /** Per recipient, off `contact_locale`, which is the whole reason the renderer takes a locale. */
  it('renders in the recipient s language', async () => {
    const copy = await digestCopy([event()], names(), 'de')

    expect(copy?.title).toBe('Anna hat die Route Kante direkt hinzugefügt')
  })

  /** Everything past the newest group is a number, not a list: a push nobody finishes reading. */
  it('counts the rest rather than listing it', async () => {
    const older = Array.from({ length: 4 }, (_, index) =>
      event({
        areaFk: areaId,
        // Far enough apart that the grouping cannot fold them into the newest one.
        createdAt: new Date(Date.parse('2026-08-01T10:00:00Z') - (index + 1) * 6 * 60 * 60 * 1000),
        id: 100 + index,
        parentId: null,
        parentType: null,
        routeFk: null,
      }),
    )

    const copy = await digestCopy([event(), ...older], names(), 'en')

    expect(copy?.title).toBe('Anna added the route Kante direkt')
    expect(copy?.body).toBe('and 4 more updates')
  })

  /** A deleted entity has no row left to name it, and the sentence still has to be a sentence.
   *  Through the message rather than its English, so rewording the placeholder is a copy change
   *  and not a broken test. */
  it('falls back to the unnamed placeholder for an entity that is gone', async () => {
    const copy = await digestCopy([event({ routeFk: 999999999 })], names(), 'en')

    expect(copy?.title).toBe(`Anna added the route ${m.common_unnamed({}, { locale: 'en' })}`)
  })

  /**
   * A deletion still names what it deleted, which is now free: anything old enough to be worth a
   * digest soft-deletes, so the row is still there to be named. Under the old shape the name
   * survived only in `oldValue`, and a select that forgot that column announced every deletion
   * with the unnamed placeholder.
   */
  it('names what a deletion deleted', async () => {
    const copy = await digestCopy([event({ verb: 'delete' })], names(), 'en')

    expect(copy?.title).toBe('Anna deleted the route Kante direkt')
  })

  /**
   * The catalogue keys a logged ascent on the ascent TYPE, which is a column of the ascent rather
   * than of the event: without the join the cron makes, every send in a digest degrades to the
   * generic "added" sentence.
   */
  it('reads a send off the ascent type the cron joined', async () => {
    const copy = await digestCopy(
      [event({ ascentFk: 4242, ascentType: 'flash', parentId: routeId, parentType: 'route', routeFk: null })],
      names(),
      'en',
    )

    expect(copy?.title).toMatch(/flashed/i)
  })
})
