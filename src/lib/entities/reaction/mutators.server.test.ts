import { pinnedTx } from '$lib/db/pinned.server'
import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { ERASED_COMMENT } from '$lib/entities/user/delete.server'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeCommentDelete } from './edit.server'

// The reaction mutators' wiring: what each answers, how a refusal arrives, and that a toggle's
// notice runs after commit. The notification fan-out itself is covered by `reaction.server.test.ts`.
let actor: SeedUser
let reactor: SeedUser
let admin: SeedUser
let maintainer: SeedUser
let regionId = 0
let eventId = 0
let actorClient: ReturnType<typeof zeroClient>
let reactorClient: ReturnType<typeof zeroClient>
let adminClient: ReturnType<typeof zeroClient>
let maintainerClient: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion('__reaction_mutators_region__')
  actor = seeded.user
  regionId = seeded.regionId
  reactor = await createThrowawayUser('reaction_mutators')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${reactor.userId}, ${reactor.authId}, 'region_user', true)`
  admin = await createThrowawayUser('reaction_mutators_admin')
  maintainer = await createThrowawayUser('reaction_mutators_maintainer')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)`
  const [event] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, subject_fk)
    values ('join', ${actor.userId}, ${regionId}, ${actor.userId}) returning id`
  eventId = event.id
  actorClient = zeroClient(actor.authId)
  reactorClient = zeroClient(reactor.authId)
  adminClient = zeroClient(admin.authId)
  maintainerClient = zeroClient(maintainer.authId)
})

afterAll(async () => {
  if (!reachable) return
  await actorClient.cleanup()
  await reactorClient.cleanup()
  await adminClient.cleanup()
  await maintainerClient.cleanup()
  await sql`delete from public.moderation_decisions where region_fk = ${regionId}`
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.reactions where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  for (const user of [reactor, admin, maintainer]) await dropThrowawayUser(user)
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

  it('keeps the replies of others when an author deletes their thread root', async () => {
    const root = (await actorClient.push('reactions.postComment', { body: 'root', eventId })).data as number
    const reply = await reactorClient.push('reactions.postComment', { body: 'answer', eventId, parentId: root })

    await actorClient.push('reactions.deleteComment', { commentId: root })

    expect(await sql`select deleted_at from public.reactions where id = ${reply.data as number}`).toEqual([
      { deleted_at: null },
    ])
  })

  it('undoes the delete of the last reply under a deleted root', async () => {
    const root = (await actorClient.push('reactions.postComment', { body: 'gone root', eventId })).data as number
    const reply = (await reactorClient.push('reactions.postComment', { body: 'last', eventId, parentId: root }))
      .data as number
    await actorClient.push('reactions.deleteComment', { commentId: root })
    await reactorClient.push('reactions.deleteComment', { commentId: reply })
    const count = async () =>
      (await sql<{ comment_count: number }[]>`select comment_count from public.events where id = ${eventId}`)[0]
        .comment_count
    const before = await count()

    expect(await reactorClient.push('reactions.restoreComment', { commentId: reply })).toEqual({})
    expect(await sql`select deleted_at from public.reactions where id = ${reply}`).toEqual([{ deleted_at: null }])
    // The reply is counted again; the placeholder root is not.
    expect(await count()).toBe(before + 1)
  })

  it('refuses a delete of somebody else comment', async () => {
    const posted = await reactorClient.push('reactions.postComment', { body: 'mine', eventId })

    const result = await actorClient.push('reactions.deleteComment', { commentId: posted.data as number })
    expect(messageOf(result)).toBe('form_noPermission')
  })

  const removal = { ground: 'harassment', reason: 'Insults another member' } as const

  it('lets a region admin remove a member comment, keeping its words only in the decision', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'rude words', eventId })).data as number

    expect((await adminClient.push('reactions.deleteComment', { commentId: id, removal })).data).toBe(id)

    expect(
      await sql`select body, removed_by, deleted_at is not null as gone, user_fk, auth_user_fk from public.reactions where id = ${id}`,
    ).toEqual([{ auth_user_fk: null, body: ERASED_COMMENT, gone: true, removed_by: 'admin', user_fk: null }])
    expect(
      await sql`select ground, reason, removed_body, object_type from public.moderation_decisions where object_id = ${id}`,
    ).toEqual([{ ground: 'harassment', object_type: 'comment', reason: removal.reason, removed_body: 'rude words' }])
  })

  it('refuses a maintainer removing somebody else comment', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'mine too', eventId })).data as number

    expect(messageOf(await maintainerClient.push('reactions.deleteComment', { commentId: id, removal }))).toBe(
      'form_noPermission',
    )
    expect(await sql`select deleted_at from public.reactions where id = ${id}`).toEqual([{ deleted_at: null }])
  })

  it('refuses an admin deleting somebody else comment without a ground and reason', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'still here', eventId })).data as number

    expect(messageOf(await adminClient.push('reactions.deleteComment', { commentId: id }))).toBe('form_noPermission')
    expect(await sql`select deleted_at from public.reactions where id = ${id}`).toEqual([{ deleted_at: null }])
  })

  // The row stays for its replies and syncs to every reader, so it keeps nothing of its author.
  it('marks an author own delete as theirs, and leaves neither words nor author on the row', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'oops', eventId })).data as number

    await reactorClient.push('reactions.deleteComment', { commentId: id })

    expect(await sql`select body, removed_by, user_fk, auth_user_fk from public.reactions where id = ${id}`).toEqual([
      { auth_user_fk: null, body: ERASED_COMMENT, removed_by: 'author', user_fk: null },
    ])
  })

  it('refuses the undo once the cleanup dropped the kept words', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'too late', eventId })).data as number
    await reactorClient.push('reactions.deleteComment', { commentId: id })
    await sql`delete from public.deleted_comments where reaction_fk = ${id}`

    expect(messageOf(await reactorClient.push('reactions.restoreComment', { commentId: id }))).toBe('form_noPermission')
  })

  it('refuses the undo to somebody removed from the region since', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'then I left', eventId })).data as number
    await reactorClient.push('reactions.deleteComment', { commentId: id })
    await sql`update public.region_members set is_active = false where region_fk = ${regionId} and user_fk = ${reactor.userId}`
    try {
      expect(messageOf(await reactorClient.push('reactions.restoreComment', { commentId: id }))).toBe(
        'form_noPermission',
      )
    } finally {
      await sql`update public.region_members set is_active = true where region_fk = ${regionId} and user_fk = ${reactor.userId}`
    }
  })

  // Two deletes racing past their gates: the second must not stamp the row a second time.
  it('writes no second delete over a comment already down', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'raced', eventId })).data as number
    const [comment] = await sql<{ body: string; event_fk: number; id: number; user_fk: number }[]>`
      select id, body, event_fk, user_fk from public.reactions where id = ${id}`
    const plan = { comment: { body: comment.body, eventFk: comment.event_fk, id, userFk: comment.user_fk } }
    await pinnedTx((tx) => writeCommentDelete(tx as never, plan, () => {}))

    await expect(pinnedTx((tx) => writeCommentDelete(tx as never, plan, () => {}))).rejects.toMatchObject({
      status: 404,
    })
    expect(await sql`select 1 from public.deleted_comments where reaction_fk = ${id}`).toHaveLength(1)
  })

  it('keeps the replies when an admin removes their root', async () => {
    const root = (await reactorClient.push('reactions.postComment', { body: 'removed root', eventId })).data as number
    const reply = await actorClient.push('reactions.postComment', { body: 'answer', eventId, parentId: root })

    await adminClient.push('reactions.deleteComment', { commentId: root, removal })

    expect(await sql`select deleted_at from public.reactions where id = ${reply.data as number}`).toEqual([
      { deleted_at: null },
    ])
  })

  it('refuses the author an undo of an admin removal of their comment', async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'taken down', eventId })).data as number
    await adminClient.push('reactions.deleteComment', { commentId: id, removal })

    expect(messageOf(await reactorClient.push('reactions.restoreComment', { commentId: id }))).toBe('form_noPermission')
    expect(await sql`select deleted_at is not null as gone from public.reactions where id = ${id}`).toEqual([
      { gone: true },
    ])
  })

  const removed = async () => {
    const id = (await reactorClient.push('reactions.postComment', { body: 'harsh words', eventId })).data as number
    await adminClient.push('reactions.deleteComment', { commentId: id, removal })
    return id
  }
  const noticesTo = (type: string) =>
    sql`select 1 from public.notifications where user_fk = ${reactor.userId} and source_type = ${type} and region_fk = ${regionId}`

  it('undoes a removal before its author read the notice: the comment is back and the notice gone', async () => {
    await sql`delete from public.notifications where user_fk = ${reactor.userId}`
    const id = await removed()
    expect(await noticesTo('content_removed')).toHaveLength(1)

    expect(await adminClient.push('moderation.undoRemoval', { id: String(id), kind: 'comment' })).toEqual({})

    expect(
      await sql`select body, deleted_at, removed_by, user_fk, auth_user_fk from public.reactions where id = ${id}`,
    ).toEqual([
      {
        auth_user_fk: reactor.authId,
        body: 'harsh words',
        deleted_at: null,
        removed_by: null,
        user_fk: reactor.userId,
      },
    ])
    expect(await noticesTo('content_removed')).toHaveLength(0)
    expect(await noticesTo('content_restored')).toHaveLength(0)
    expect(
      await sql`select reversed_by_fk from public.moderation_decisions where object_type = 'comment' and object_id = ${String(id)}`,
    ).toEqual([{ reversed_by_fk: admin.userId }])
  })

  it('tells an author who already read the notice that the comment is back', async () => {
    await sql`delete from public.notifications where user_fk = ${reactor.userId}`
    const id = await removed()
    await sql`update public.notifications set read_at = now() where user_fk = ${reactor.userId}`

    await adminClient.push('moderation.undoRemoval', { id: String(id), kind: 'comment' })

    expect(await noticesTo('content_restored')).toHaveLength(1)
  })

  it('refuses an undo by anybody but the admin who removed it', async () => {
    const id = await removed()

    expect(messageOf(await maintainerClient.push('moderation.undoRemoval', { id: String(id), kind: 'comment' }))).toBe(
      'form_noPermission',
    )
    expect(messageOf(await reactorClient.push('moderation.undoRemoval', { id: String(id), kind: 'comment' }))).toBe(
      'form_noPermission',
    )
  })
})
