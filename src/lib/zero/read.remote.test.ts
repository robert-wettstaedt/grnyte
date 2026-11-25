/** The server read: a registered query definition, run as the caller, through the remote function itself. */
import {
  createThrowawayUser,
  dropGuidebookRegion,
  dropThrowawayUser,
  reachable,
  sql,
  type SeedUser,
} from '$lib/db/testDb'
import { zero } from '$lib/entities/event/testContext'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { asRequest, newSession, requestLocals, statusOf, withLocals } from '$lib/remote/testHarness'
import { mustGetQuery } from '@rocicorp/zero'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { queries } from './queries'
import { readQuery } from './read.remote'

type Row = { actor?: { username: string }; id: number; regionFk: number }

let member: SeedUser
let other: SeedUser
/** An active member of the first region whose role holds no `region.read`. */
let unprivileged: SeedUser
let regionId: number
let otherRegionId: number
let areaId: number
let eventId: number
let otherEventId: number

const region = async (owner: SeedUser) => {
  const [row] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__read_region__', ${owner.userId}) returning id`
  return row.id
}

const join = (regionFk: number, user: SeedUser, role: string) => sql`
  insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
  values (${regionFk}, ${user.userId}, ${user.authId}, ${role}, true)`

/** An area in `regionFk`, with a create event by `actor`. */
async function areaWithEvent(regionFk: number, actor: SeedUser) {
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__read_area__', 'area', ${regionFk}, ${actor.userId}) returning id`
  const [event] = await sql<{ id: number }[]>`
    insert into public.events (region_fk, area_fk, actor_fk, verb)
    values (${regionFk}, ${area.id}, ${actor.userId}, 'create') returning id`
  return { areaId: area.id, eventId: event.id }
}

beforeAll(async () => {
  if (!reachable) return
  ;[member, other, unprivileged] = [
    await createThrowawayUser('read_member'),
    await createThrowawayUser('read_other'),
    await createThrowawayUser('read_unprivileged'),
  ]
  regionId = await region(member)
  otherRegionId = await region(other)
  await join(regionId, member, 'region_user')
  await join(otherRegionId, other, 'region_user')
  await join(regionId, unprivileged, 'app_admin')
  ;({ areaId, eventId } = await areaWithEvent(regionId, member))
  ;({ eventId: otherEventId } = await areaWithEvent(otherRegionId, other))
  await sql`
    insert into public.notifications (region_fk, actor_fk, auth_user_fk, source_type, user_fk, area_fk)
    values (${regionId}, ${unprivileged.userId}, ${member.authId}, 'mention', ${member.userId}, ${areaId})`
  await sql`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${eventId}, 'A comment', 'comment', ${regionId}, ${member.authId}, ${member.userId})`
  await sql`
    insert into public.content_reports (region_fk, reporter_fk, object_type, object_id, ground)
    values (${regionId}, ${member.userId}, 'area', ${String(areaId)}, 'spam')`
})

afterAll(async () => {
  if (!reachable) return
  for (const id of [regionId, otherRegionId]) {
    await sql`delete from public.notifications where region_fk = ${id}`
    await sql`delete from public.content_reports where region_fk = ${id}`
    await dropGuidebookRegion(id)
  }
  for (const user of [member, other, unprivileged]) await dropThrowawayUser(user)
})

const read = (user: SeedUser, name: string, args: unknown = {}, as = user.authId) =>
  asRequest(user.authId, () => readQuery({ args: args as never, as, name })) as Promise<Row[]>

describe.skipIf(!reachable)('readQuery', () => {
  it("answers a member their region's event, with its actor's name", async () => {
    expect(await read(member, 'listEvents')).toEqual([
      expect.objectContaining({
        actor: expect.objectContaining({ username: member.email }),
        id: eventId,
        regionFk: regionId,
      }),
    ])
  })

  it("answers a member of another region none of that region's events", async () => {
    expect((await read(other, 'listEvents')).map((row) => row.id)).toEqual([otherEventId])
    expect(await read(other, 'listEvents', { regionFk: regionId })).toEqual([])
  })

  it('answers no events to a member whose role may not read the region', async () => {
    const { userRegions } = await getUserPermissions(unprivileged.authId)
    // The definition's own filter lets the region through, so only row-level security refuses.
    expect(userRegions?.map((row) => row.regionFk)).toEqual([regionId])

    expect(await read(unprivileged, 'listEvents')).toEqual([])
  })

  it('refuses a caller without a live session', async () => {
    const sessionId = await newSession(member.authId)
    const signOut = async () => ({ error: null })
    const locals = await requestLocals(member.authId, { auth: { signOut } }, { sessionId })
    await sql`delete from auth.sessions where id = ${sessionId}`

    const run = () => withLocals(locals, () => readQuery({ args: {}, as: member.authId, name: 'listEvents' }))
    expect(await statusOf(run as () => Promise<unknown>)).toBe(401)
  })

  it('refuses a caller whose memberships could not be loaded', async () => {
    const locals = await requestLocals(member.authId)
    const as = (changed: object) => () =>
      withLocals({ ...locals, ...changed }, () => readQuery({ args: {}, as: member.authId, name: 'listEvents' }))

    expect(await statusOf(as({ backendUnavailable: true }) as () => Promise<unknown>)).toBe(503)
    expect(await statusOf(as({ userRegions: undefined }) as () => Promise<unknown>)).toBe(500)
  })

  it('refuses a name it does not know, and arguments the query does not accept', async () => {
    expect(await statusOf(() => read(member, 'toString'))).toBe(400)
    expect(await statusOf(() => read(member, 'madeUp'))).toBe(400)
    expect(await statusOf(() => read(member, 'listEvents', { limit: 'all' }))).toBe(400)
  })

  it("refuses a read asked for another account than the session's", async () => {
    expect(await statusOf(() => read(member, 'listEvents', {}, other.authId))).toBe(409)
  })
})

describe.skipIf(!reachable)('running a definition as the caller', () => {
  it('answers what zero-cache would serve the same member', async () => {
    const ctx = { authUserId: member.authId, pageState: await getUserPermissions(member.authId) }
    const asked: [string, object][] = [
      ['listEvents', { limit: 20, regionFk: regionId }],
      ['listEvents', { limit: 1, scope: { id: areaId, type: 'area' } }],
      ['listNotifications', {}],
      ['countUnreadNotifications', {}],
      ['listComments', { eventId }],
      ['myOpenReports', {}],
    ]
    for (const [name, args] of asked) {
      const direct = await zero.run(mustGetQuery(queries, name).fn({ args, ctx } as never) as never)
      const served = await read(member, name, args)

      expect(served, name).toHaveLength(1)
      expect(served, name).toEqual(direct)
    }
  })
})
