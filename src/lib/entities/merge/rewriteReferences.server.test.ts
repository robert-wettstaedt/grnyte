/**
 * `rewriteReferences`: stored text that names the source names the survivor afterwards; history and
 * look-alike ids are untouched, and nothing is recorded as an edit. Skipped without DATABASE_URL.
 */
import * as schema from '$lib/db/schema'
import { reachable, seedRegion, sql } from '$lib/db/testDb'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rewriteReferences } from './repoint.server'

const db = drizzle(sql, { schema })
const NAME = '__rewrite_references__'
const SOURCE = 914_000_001
const SURVIVOR = 914_000_002
const ref = (id: number) => `!blocks:${id}!`

let regionId = 0
const ids = { area: 0, change: 0, comment: 0, deletedComment: 0, event: 0, lookalike: 0 }

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(NAME)
  regionId = seeded.regionId
  const by = seeded.user.userId
  const [area, lookalike] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by, description)
    values (${NAME}, ${regionId}, ${by}, ${`Start left of ${ref(SOURCE)}, then ${ref(SOURCE)} again`}),
           (${NAME}, ${regionId}, ${by}, ${`Not this one: !blocks:${SOURCE}0!`}) returning id`
  const [event] = await sql<{ id: number }[]>`
    insert into public.events (region_fk, verb, area_fk, actor_fk) values (${regionId}, 'update', ${area.id}, ${by}) returning id`
  const [change] = await sql<{ id: number }[]>`
    insert into public.changes (region_fk, event_fk, column_name, new_value)
    values (${regionId}, ${event.id}, 'description', ${`Start left of ${ref(SOURCE)}`}) returning id`
  const [comment] = await sql<{ id: number }[]>`
    insert into public.reactions (region_fk, event_fk, type, body, user_fk)
    values (${regionId}, ${event.id}, 'comment', ${`Is ${ref(SOURCE)} the same?`}, ${by}) returning id`
  const [deletedComment] = await sql<{ id: number }[]>`
    insert into public.deleted_comments (reaction_fk, user_fk, body) values (${comment.id}, ${by}, ${`See ${ref(SOURCE)}`}) returning reaction_fk as id`
  Object.assign(ids, {
    area: area.id,
    change: change.id,
    comment: comment.id,
    deletedComment: deletedComment.id,
    event: event.id,
    lookalike: lookalike.id,
  })
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.deleted_comments where reaction_fk = ${ids.deletedComment}`
    await sql`delete from public.reactions where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('rewriteReferences', () => {
  it('rewrites descriptions and comments, leaves history and look-alikes, and records nothing', async () => {
    const eventsBefore = (await sql`select id from public.events where region_fk = ${regionId}`).length

    await rewriteReferences(db, 'blocks', SOURCE, SURVIVOR)

    const text = async (query: Promise<{ text: string }[]>) => (await query)[0].text
    expect(await text(sql`select description as text from public.areas where id = ${ids.area}`)).toBe(
      `Start left of ${ref(SURVIVOR)}, then ${ref(SURVIVOR)} again`,
    )
    expect(await text(sql`select body as text from public.reactions where id = ${ids.comment}`)).toBe(
      `Is ${ref(SURVIVOR)} the same?`,
    )
    expect(
      await text(sql`select body as text from public.deleted_comments where reaction_fk = ${ids.deletedComment}`),
    ).toBe(`See ${ref(SURVIVOR)}`)
    expect(await text(sql`select description as text from public.areas where id = ${ids.lookalike}`)).toBe(
      `Not this one: !blocks:${SOURCE}0!`,
    )
    expect(await text(sql`select new_value as text from public.changes where id = ${ids.change}`)).toBe(
      `Start left of ${ref(SOURCE)}`,
    )
    expect(await sql`select id from public.events where region_fk = ${regionId}`).toHaveLength(eventsBefore)
  })
})
