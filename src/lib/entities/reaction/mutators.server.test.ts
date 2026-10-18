import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The reaction mutators' wiring: what each answers, how a refusal arrives, and that a toggle's
// notice runs after commit. The notification fan-out itself is covered by `reaction.server.test.ts`.
let actor: SeedUser
let reactor: SeedUser
let regionId = 0
let eventId = 0
let actorClient: ReturnType<typeof zeroClient>
let reactorClient: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion('__reaction_mutators_region__')
  actor = seeded.user
  regionId = seeded.regionId
  reactor = await createThrowawayUser('reaction_mutators')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${reactor.userId}, ${reactor.authId}, 'region_user', true)`
  const [event] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, subject_fk)
    values ('join', ${actor.userId}, ${regionId}, ${actor.userId}) returning id`
  eventId = event.id
  actorClient = zeroClient(actor.authId)
  reactorClient = zeroClient(reactor.authId)
})

afterAll(async () => {
  if (!reachable) return
  await actorClient.cleanup()
  await reactorClient.cleanup()
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.reactions where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  await dropThrowawayUser(reactor)
})

const live = (type: 'comment' | 'emoji', userFk: number) => sql`
  select body from public.reactions
  where event_fk = ${eventId} and user_fk = ${userFk} and type = ${type} and deleted_at is null`

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

describe.skipIf(!reachable)('reaction mutators', () => {
  it('reacts, notifies the actor after commit, and clears on the same emoji', async () => {
    const tap = () => reactorClient.push('reactions.toggle', { emoji: '👍', eventId, userId: reactor.userId })

    expect((await tap()).data).toBe(true)
    expect(await live('emoji', reactor.userId)).toEqual([{ body: '👍' }])
    expect(
      await sql`select 1 from public.notifications where event_fk = ${eventId} and user_fk = ${actor.userId}`,
    ).toHaveLength(1)

    expect((await tap()).data).toBe(false)
    expect(await live('emoji', reactor.userId)).toEqual([])
  })

  it('refuses a reaction on your own event', async () => {
    const result = await actorClient.push('reactions.toggle', { emoji: '👍', eventId, userId: actor.userId })

    expect(messageOf(result)).toBe('form_noPermission')
  })

  it('comments, deletes, and restores through the undo', async () => {
    const posted = await reactorClient.push('reactions.postComment', { body: '  nice line  ', eventId })
    const id = posted.data as number

    expect(await live('comment', reactor.userId)).toEqual([{ body: 'nice line' }])
    expect(
      await sql`select 1 from public.notifications where reaction_fk = ${id} and user_fk = ${actor.userId}`,
    ).toHaveLength(1)
    expect((await reactorClient.push('reactions.deleteComment', { commentId: id })).data).toBe(id)
    expect(await live('comment', reactor.userId)).toEqual([])

    expect(await reactorClient.push('reactions.restoreComment', { commentId: id })).toEqual({})
    expect(await live('comment', reactor.userId)).toEqual([{ body: 'nice line' }])
  })

  it('refuses a delete of somebody else comment', async () => {
    const posted = await reactorClient.push('reactions.postComment', { body: 'mine', eventId })

    const result = await actorClient.push('reactions.deleteComment', { commentId: posted.data as number })
    expect(messageOf(result)).toBe('form_noPermission')
  })
})
