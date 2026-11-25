/** The write route, through `handleSyncMutate` and its Response; read back through the queries the screens use. */
import { env } from '$env/dynamic/private'
import {
  createThrowawayUser,
  dropGuidebookRegion,
  dropThrowawayUser,
  reachable,
  seedRegion,
  sql,
  type SeedUser,
} from '$lib/db/testDb'
import { zero } from '$lib/entities/event/testContext'
import { routeListsFingerprint } from '$lib/entities/route/fingerprint'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { newSession, sessionToken, signAccessToken } from '$lib/remote/testHarness'
import { queries } from '$lib/zero/queries'
import { ApplicationError, defineMutators } from '@rocicorp/zero'
import { isHttpError } from '@sveltejs/kit'
import { sql as drizzleSql } from 'drizzle-orm'
import { SignJWT } from 'jose'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serverMutators } from '../mutators.server'
import { asCaller, defineServerMutator } from './serverMutator.server'
import { handleSyncMutate, sweepAppliedWrites } from './syncMutate.server'

const REGION = '__sync_mutate_region__'

let areaId: number
let blockId: number
let memberToken: string
let member: SeedUser
let regionId: number
let token: string
let user: SeedUser

type Answer = { body: { data?: unknown; field?: unknown; message?: string }; status: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each caller asserts the shape it wants
async function read(query: { fn: (options: any) => unknown }, args: unknown): Promise<any> {
  const ctx = { authUserId: user.authId, pageState: await getUserPermissions(user.authId) }
  return zero.run(query.fn({ args, ctx }) as never)
}

/** Sends a write; a status thrown through Kit's `error` is answered as the route would. */
async function send(
  name: string,
  args: unknown,
  { as = token, id = randomUUID() as unknown, registry }: { as?: string; id?: unknown; registry?: unknown } = {},
): Promise<Answer> {
  const request = new Request('http://localhost/api/sync/mutate', {
    body: JSON.stringify({ args, id, name }),
    headers: { 'content-type': 'application/json', ...(as === '' ? {} : { authorization: `Bearer ${as}` }) },
    method: 'POST',
  })
  try {
    const response = await handleSyncMutate(request, registry as never)
    return { body: (await response.json()) as Answer['body'], status: response.status }
  } catch (thrown) {
    if (!isHttpError(thrown)) throw thrown
    return { body: thrown.body, status: thrown.status }
  }
}

const savedAreas = async () =>
  ((await read(queries.listUserAllFavorites, { userId: user.userId })) as { areaFk: null | number }[]).map(
    (row) => row.areaFk,
  )

async function newRoute(name: string) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values (${name}, ${blockId}, ${regionId}, ${user.userId}) returning id`
  return row.id
}

const routeName = async (id: number) =>
  ((await read(queries.listRoutes, { routeId: id })) as { id: number; name: string }[]).find((row) => row.id === id)
    ?.name

const edit = (id: number, name: string) => ({
  blockId: String(blockId),
  id: String(id),
  known: routeListsFingerprint([], []),
  name,
})

const createEvents = (areaFk: number) =>
  read(queries.listEvents, { regionFk: regionId, scope: { id: areaFk, type: 'area' } })

/** Two hours old, so an hour past its end. */
const expired = async () =>
  new SignJWT({ role: 'authenticated', session_id: await newSession(user.authId) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setAudience('authenticated')
    .setSubject(user.authId)
    .setIssuedAt('2 hours ago')
    .setExpirationTime('1 hour ago')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET))

const newArea = (name: string) => ({ name, regionFk: String(regionId) })

const areasNamed = async (name: string) =>
  ((await read(queries.listAreas, {})) as { id: number; name: string; regionFk: number }[])
    .filter((row) => row.regionFk === regionId && row.name === name)
    .map((row) => row.id)

const favorite = (saved = true) => ({ entityId: areaId, entityType: 'area', saved, userId: user.userId })

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_maintainer')
  regionId = seeded.regionId
  user = seeded.user
  token = await sessionToken(user.authId)
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__sync_mutate_area__', 'area', ${regionId}, ${user.userId}) returning id`
  areaId = area.id
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__sync_mutate_block__', ${areaId}, ${regionId}, ${user.userId}, 0) returning id`
  blockId = block.id
  // Reads the region, edits nothing.
  member = await createThrowawayUser('sync_mutate')
  memberToken = await sessionToken(member.authId)
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${member.userId}, ${member.authId}, 'region_user', true)`
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.favorites where region_fk = ${regionId}`
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await dropGuidebookRegion(regionId)
  await dropThrowawayUser(member)
})

describe.skipIf(!reachable)('a write', () => {
  it('saves a favorite the member then finds among their saved ones', async () => {
    expect((await send('favorites.set', favorite())).status).toBe(200)

    expect(await savedAreas()).toContain(areaId)
    await send('favorites.set', favorite(false))
  })

  it('answers the new area, and it can be read by that id', async () => {
    const { body, status } = await send('areas.create', newArea('Created Here'))

    expect(status).toBe(200)
    const { id } = body.data as { id: number }
    expect(await read(queries.area, { id })).toMatchObject({ name: 'Created Here' })
  })
})

describe.skipIf(!reachable)('who may write, and what a request is', () => {
  it.each([
    ['no token', async () => ''],
    ['a forged token', async () => `${token.slice(0, -4)}AAAA`],
    ['an expired token', expired],
    [
      'a token whose session was ended',
      async () => {
        const sessionId = await newSession(user.authId)
        await sql`delete from auth.sessions where id = ${sessionId}`
        return signAccessToken(user.authId, undefined, sessionId)
      },
    ],
  ])('refuses %s and writes nothing', async (_, as) => {
    expect((await send('favorites.set', favorite(), { as: await as() })).status).toBe(401)
    expect(await savedAreas()).not.toContain(areaId)
  })

  it.each(['made.up', 'areas', 'toString'])('refuses the name %s, which is no mutator', async (name) => {
    expect((await send(name, {})).status).toBe(400)
  })

  it('refuses a body without a write id', async () => {
    expect((await send('favorites.set', favorite(), { id: null })).status).toBe(400)
    expect(await savedAreas()).not.toContain(areaId)
  })

  it('refuses a body that is not JSON', async () => {
    const request = new Request('http://localhost/api/sync/mutate', {
      body: 'nonsense',
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
    })
    expect((await handleSyncMutate(request)).status).toBe(400)
  })

  it('refuses arguments the mutator does not accept, in our words', async () => {
    const { body, status } = await send('favorites.set', { entityId: 'secret' })

    expect(status).toBe(400)
    expect(JSON.parse(body.message!)).toMatchObject({ message: 'error_server_title' })
  })

  it('refuses a member who may not edit, and changes nothing', async () => {
    const routeId = await newRoute('Kept Name')

    expect((await send('routes.update', edit(routeId, 'Taken Over'), { as: memberToken })).status).toBe(400)
    expect(await routeName(routeId)).toBe('Kept Name')
  })
})

describe.skipIf(!reachable)('a write sent more than once', () => {
  it('applies once, and answers the same both times', async () => {
    const id = randomUUID()
    const first = await send('areas.create', newArea('Sent Twice'), { id })
    const second = await send('areas.create', newArea('Sent Twice'), { id })

    expect(first.status).toBe(200)
    expect(second).toEqual(first)
    expect(await areasNamed('Sent Twice')).toEqual([(first.body.data as { id: number }).id])
    expect(await createEvents((first.body.data as { id: number }).id)).toHaveLength(1)
  })

  it('applies once when both copies arrive at the same moment', async () => {
    const id = randomUUID()
    const answers = await Promise.all([1, 2].map(() => send('areas.create', newArea('At Once'), { id })))

    expect(answers[0].status).toBe(200)
    expect(answers[1]).toEqual(answers[0])
    expect(await areasNamed('At Once')).toEqual([(answers[0].body.data as { id: number }).id])
    expect(await createEvents((answers[0].body.data as { id: number }).id)).toHaveLength(1)
  })

  it("refuses another member's id, and shows nothing of the recorded answer", async () => {
    const id = randomUUID()
    const { body } = await send('areas.create', newArea('Mine'), { id })
    const other = await send('areas.create', newArea('Mine'), { as: memberToken, id })

    expect(other.status).toBe(409)
    expect(JSON.stringify(other.body)).not.toContain(String((body.data as { id: number }).id))
  })

  it('refuses the id for another mutator, and does not run it', async () => {
    const id = randomUUID()
    const { body } = await send('areas.create', newArea('Not Deleted'), { id })
    const areaFk = (body.data as { id: number }).id

    expect((await send('areas.delete', { id: areaFk }, { id })).status).toBe(409)
    expect(await areasNamed('Not Deleted')).toEqual([areaFk])
  })

  it('judges a refused write again', async () => {
    const id = randomUUID()
    const taken = await newRoute('Taken')
    const routeId = await newRoute('Waiting')
    expect((await send('routes.update', edit(routeId, 'Taken'), { id })).status).toBe(400)
    await sql`update public.routes set name = 'Freed' where id = ${taken}`

    expect((await send('routes.update', edit(routeId, 'Taken'), { id })).status).toBe(200)
    expect(await routeName(routeId)).toBe('Taken')
  })
})

describe.skipIf(!reachable)('a refusal', () => {
  it('names the field and our message', async () => {
    await newRoute('Occupied')
    const { body, status } = await send('routes.update', edit(await newRoute('Renaming'), 'Occupied'))

    expect(status).toBe(400)
    expect(body.field).toBe('name')
    expect(JSON.parse(body.message!)).toMatchObject({ message: 'routes_nameExists' })
  })

  it('answers the status the refusal names', async () => {
    const { body, status } = await send('favorites.set', { ...favorite(), entityId: 2_000_000_000 })

    expect(status).toBe(404)
    expect(JSON.parse(body.message!)).toMatchObject({ message: 'areas_notFound' })
  })

  it('says nothing of a database error', async () => {
    let reached = false
    const registry = defineMutators(serverMutators, {
      probe: {
        breaks: defineServerMutator(async ({ ctx, tx }) => {
          reached = true
          await asCaller(tx, ctx, (db) => db.execute(drizzleSql`select 'secret-crag'::int`))
        }),
      },
    })
    const { body } = await send('probe.breaks', undefined, { registry })

    // A mutator without arguments: JSON drops the key, and the route has to run it all the same.
    expect(reached).toBe(true)
    expect(JSON.parse(body.message!)).toMatchObject({ message: 'error_server_title' })
    expect(JSON.stringify(body)).not.toContain('secret-crag')
  })
})

describe.skipIf(!reachable)('deferred work', () => {
  it('runs once after a write, not after a refused one and not after a replay', async () => {
    const ran: string[] = []
    const registry = defineMutators(serverMutators, {
      probe: {
        defer: defineServerMutator(async ({ args, ctx }) => {
          ctx.afterCommit(async () => void ran.push(String(args)))
          if (args === 'refused') throw new ApplicationError('refused')
        }),
      },
    })
    const id = randomUUID()
    await send('probe.defer', 'refused', { registry })
    await send('probe.defer', 'applied', { id, registry })
    await send('probe.defer', 'applied', { id, registry })

    expect(ran).toEqual(['applied'])
  })
})

describe.skipIf(!reachable)('a recorded write', () => {
  const DAY = 24 * 60 * 60 * 1000
  /** Older than any row another suite keeps (29 days), younger than what the cleanup task deletes meanwhile (30). */
  const backdate = (id: string) =>
    sql`update public.applied_writes set created_at = now() - interval '29 days 20 hours' where id = ${id}`
  const sweep = (daysAgo: number) => sweepAppliedWrites(new Date(Date.now() - daysAgo * DAY))

  // A row left by a run that failed would be counted.
  beforeAll(async () => {
    if (reachable) await sweep(29.5)
  })

  it('is run again when it is sent again after a sweep whose cut lies after it', async () => {
    const id = randomUUID()
    const first = await send('areas.create', newArea('Swept'), { id })
    await sql`update public.areas set name = 'Renamed' where id = ${(first.body.data as { id: number }).id}`
    await backdate(id)

    expect(await sweep(29.5)).toBe(1)

    const second = await send('areas.create', newArea('Swept'), { id })
    expect(second.status).toBe(200)
    expect(await areasNamed('Swept')).toEqual([(second.body.data as { id: number }).id])
  })

  it('still answers what it answered after a sweep whose cut lies before it', async () => {
    const id = randomUUID()
    const first = await send('areas.create', newArea('Kept'), { id })
    await backdate(id)

    expect(await sweep(29.9)).toBe(0)

    expect(await send('areas.create', newArea('Kept'), { id })).toEqual(first)
    expect(await areasNamed('Kept')).toHaveLength(1)
  })
})
