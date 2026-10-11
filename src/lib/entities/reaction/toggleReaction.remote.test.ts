// @vitest-environment node
/** Two taps in flight at once must land as one reaction, not a unique-index 500. */
import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toggleReaction } from './reactions.remote'

let actor: SeedUser
let reactor: SeedUser
let regionId = 0
let eventId = 0

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion('__toggle_reaction_region__')
  actor = seeded.user
  regionId = seeded.regionId
  reactor = await createThrowawayUser('toggle_reaction')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${reactor.userId}, ${reactor.authId}, 'region_user', true)`
  const [event] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, subject_fk)
    values ('join', ${actor.userId}, ${regionId}, ${actor.userId}) returning id`
  eventId = event.id
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.notifications where event_fk = ${eventId}`
    await sql`delete from public.reactions where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
    await dropThrowawayUser(reactor)
  }
  await sql.end()
})

describe.skipIf(!reachable)('toggleReaction', () => {
  it('lands two concurrent taps as one live reaction', async () => {
    const tap = () => asRequest(reactor.authId, () => toggleReaction({ emoji: '👍', eventId }))

    await expect(Promise.all([tap(), tap()])).resolves.toBeDefined()

    const rows = await sql`
      select 1 from public.reactions
      where event_fk = ${eventId} and user_fk = ${reactor.userId} and deleted_at is null`
    expect(rows.length).toBe(1)
  })
})
