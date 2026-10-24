import { pinnedTx } from '$lib/db/pinned.server'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { toDisplayName } from '$lib/entities/displayName'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordRemoval, type Removal } from './record.server'

let admin: SeedUser
let ada: SeedUser
let bo: SeedUser
let regionId = 0

beforeAll(async () => {
  if (!reachable) return
  admin = await createThrowawayUser('moderation_admin')
  ada = await createThrowawayUser('moderation_ada')
  bo = await createThrowawayUser('moderation_bo')
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__moderation_record__', ${admin.userId}) returning id`
  regionId = region.id
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${ada.userId}, ${ada.authId}, 'region_user', true),
      (${regionId}, ${bo.userId}, ${bo.authId}, 'region_user', true)`
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.moderation_decisions where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  for (const user of [admin, ada, bo]) await dropThrowawayUser(user)
})

describe.skipIf(!reachable)('recordRemoval', () => {
  it('writes one decision and a subject row per author', async () => {
    const decisionId = await pinnedTx((tx) =>
      recordRemoval(
        tx,
        {
          actorFk: admin.userId,
          ground: 'spam',
          object: { id: '41', kind: 'area' },
          reason: 'Advertising a gym',
          regionFk: regionId,
          subjects: [
            { items: [{ kind: 'route', name: toDisplayName('Odin') }], userFk: ada.userId },
            { items: [{ kind: 'file', name: toDisplayName('Photo') }], userFk: bo.userId },
          ],
        },
        () => {},
      ),
    )

    expect(
      await sql`select ground, object_type, object_id, reason, actor_fk from public.moderation_decisions where id = ${decisionId}`,
    ).toEqual([
      { actor_fk: admin.userId, ground: 'spam', object_id: '41', object_type: 'area', reason: 'Advertising a gym' },
    ])
    expect(
      await sql`select user_fk, items from public.moderation_decision_subjects where decision_fk = ${decisionId} order by user_fk`,
    ).toEqual([
      { items: [{ kind: 'route', name: 'Odin' }], user_fk: ada.userId },
      { items: [{ kind: 'file', name: 'Photo' }], user_fk: bo.userId },
    ])
  })

  const remove = async (subjects: Removal['subjects']) => {
    const queued: (() => Promise<void>)[] = []
    const id = await pinnedTx((tx) =>
      recordRemoval(
        tx,
        {
          actorFk: admin.userId,
          ground: 'harassment',
          object: { id: '7', kind: 'route' },
          reason: 'Insults',
          regionFk: regionId,
          subjects,
        },
        (task) => queued.push(task),
      ),
    )
    for (const task of queued) await task()
    return id
  }

  const notices = (userFk: number) => sql<{ decision_fk: number; metadata: string }[]>`
    select decision_fk, metadata from public.notifications
    where user_fk = ${userFk} and source_type = 'content_removed' order by decision_fk`

  it('tells each live author once, after commit, with what of theirs went, and nobody for a deleted account', async () => {
    const id = await remove([
      { items: [{ kind: 'route', name: toDisplayName('Odin') }], userFk: ada.userId },
      { items: [{ kind: 'route', name: toDisplayName('Thor') }], userFk: bo.userId },
      { items: [{ kind: 'route', name: toDisplayName('Loki') }], userFk: null },
    ])

    expect(await notices(ada.userId)).toEqual([{ decision_fk: id, metadata: '[{"kind":"route","name":"Odin"}]' }])
    expect((await notices(bo.userId)).map((row) => row.decision_fk)).toEqual([id])
    expect(await sql`select actor_fk from public.notifications where decision_fk = ${id}`).toEqual([
      { actor_fk: null },
      { actor_fk: null },
    ])
  })

  it('tells an author twice about two removals of their content by the same admin', async () => {
    const first = await remove([{ items: [{ kind: 'route', name: toDisplayName('A') }], userFk: ada.userId }])
    const second = await remove([{ items: [{ kind: 'route', name: toDisplayName('B') }], userFk: ada.userId }])

    const ids = (await notices(ada.userId)).map((row) => row.decision_fk)
    expect(ids).toContain(first)
    expect(ids).toContain(second)
  })
})
