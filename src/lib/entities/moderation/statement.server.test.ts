import { pinnedTx } from '$lib/db/pinned.server'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { toDisplayName } from '$lib/entities/displayName'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordRemoval } from './record.server'
import { readStatement } from './statement.server'

let admin: SeedUser
let ada: SeedUser
let otherAdmin: SeedUser
let regionId = 0
let decisionId = 0

beforeAll(async () => {
  if (!reachable) return
  ;[admin, ada, otherAdmin] = await Promise.all(
    ['admin', 'ada', 'other'].map((who) => createThrowawayUser(`statement_${who}`)),
  )
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__moderation_statement__', ${admin.userId}) returning id`
  regionId = region.id
  decisionId = await pinnedTx((tx) =>
    recordRemoval(
      tx,
      {
        actorFk: admin.userId,
        ground: 'harassment',
        object: { id: '9', kind: 'comment' },
        reason: 'Insults another member',
        regionFk: regionId,
        subjects: [{ items: [{ kind: 'comment', name: toDisplayName('You are all…') }], userFk: ada.userId }],
      },
      () => {},
    ),
  )
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.moderation_decisions where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  for (const user of [admin, ada, otherAdmin]) await dropThrowawayUser(user)
})

const as = (user: SeedUser, userPermissions: string[] = []) => ({ user: { id: user.userId }, userPermissions }) as never

const statusOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 200
  } catch (thrown) {
    return (thrown as { status?: number }).status
  }
}

describe.skipIf(!reachable)('readStatement', () => {
  it('shows its author what went, where, on which ground and why', async () => {
    expect(await readStatement(decisionId, as(ada))).toMatchObject({
      ground: 'harassment',
      items: [{ kind: 'comment', name: 'You are all…' }],
      reason: 'Insults another member',
      reference: `D-${decisionId}`,
      regionName: '__moderation_statement__',
    })
  })

  it('answers an app admin', async () => {
    expect(await statusOf(() => readStatement(decisionId, as(otherAdmin, ['app.admin'])))).toBe(200)
  })

  it.each([
    ['another region admin', () => otherAdmin],
    ['the admin who removed it', () => admin],
  ])('is not found for %s', async (_, who) => {
    expect(await statusOf(() => readStatement(decisionId, as(who())))).toBe(404)
  })
})
