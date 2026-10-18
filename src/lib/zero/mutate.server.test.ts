import { applyRls } from '$lib/db/db.server'
import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { routeListsFingerprint } from '$lib/entities/route/fingerprint'
import { signAccessToken } from '$lib/remote/testHarness'
import { ApplicationError, defineMutators, mustGetMutator } from '@rocicorp/zero'
import { sql as drizzleSql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleMutate } from './mutate.server'
import { mutators } from './mutators'
import { serverMutators } from './mutators.server'
import { asCaller, asPrivileged, defineServerMutator } from './serverMutator.server'

const REGION = '__mutate_region__'

/** A probe's own text, in the authored shape the endpoint lets through. */
const said = (text: string) => JSON.stringify({ message: 'error_server_title', params: { text } })
const heard = (message: string | undefined) =>
  (JSON.parse(message ?? '{}') as { params?: { text?: string } }).params?.text
const FOREIGN = '__mutate_foreign__'

let user: SeedUser
let token: string
let areaId: number
let foreignAreaId: number
let foreignRegionId: number
const clientGroupID = `spike-${randomUUID()}`
const clientID = `client-${randomUUID()}`
let nextId = 1
let regionId: number
let blockId: number
let routeId: number

beforeAll(async () => {
  if (!reachable) return

  const seeded = await seedRegion(REGION, 'region_maintainer')
  user = seeded.user
  token = await signAccessToken(user.authId, undefined)

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__mutate_area__', 'area', ${seeded.regionId}, ${user.userId}) returning id`
  areaId = area.id

  const [foreign] = await sql<
    { id: number }[]
  >`insert into public.regions (name, created_by) values (${FOREIGN}, ${user.userId}) returning id`
  const [foreignArea] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__mutate_foreign_area__', 'area', ${foreign.id}, ${user.userId}) returning id`
  foreignAreaId = foreignArea.id
  foreignRegionId = foreign.id

  regionId = seeded.regionId
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__mutate_block__', ${areaId}, ${regionId}, ${user.userId}, 0) returning id`
  blockId = block.id
  const [route, sibling] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__mutate_route__', ${blockId}, ${regionId}, ${user.userId}),
           ('__mutate_sibling__', ${blockId}, ${regionId}, ${user.userId}) returning id`
  routeId = route.id
  void sibling
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.favorites where area_fk in (${areaId}, ${foreignAreaId})`
  await sql`delete from public.areas where id in (${areaId}, ${foreignAreaId})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name in (${REGION}, ${FOREIGN}))`
  await sql`delete from public.regions where name in (${REGION}, ${FOREIGN})`
  await sql`delete from zero_0.clients where "clientGroupID" = ${clientGroupID}`
  await sql`delete from zero_0.mutations where "clientGroupID" = ${clientGroupID}`
})

async function favoriteCount(id: number) {
  const [row] = await sql<
    { count: number }[]
  >`select count(*)::int as count from public.favorites where area_fk = ${id}`
  return row.count
}

async function lastMutationID() {
  const [row] = await sql<{ lastMutationID: string }[]>`
    select "lastMutationID" from zero_0.clients where "clientGroupID" = ${clientGroupID} and "clientID" = ${clientID}`
  return Number(row?.lastMutationID)
}

async function push(name: string, args: unknown, registry = serverMutators) {
  const body = {
    clientGroupID,
    mutations: [{ args: [args], clientID, id: nextId++, name, timestamp: Date.now(), type: 'custom' }],
    pushVersion: 1,
    requestID: randomUUID(),
    timestamp: Date.now(),
  }
  const request = new Request('http://localhost/api/zero/mutate?schema=zero_0&appID=zero', {
    body: JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST',
  })
  const response = await handleMutate(request, registry)
  const json = (await response.json()) as {
    mutations: { result: { details?: unknown; error?: string; message?: string } }[]
  }
  return json.mutations[0].result
}

describe.skipIf(!reachable)('zero mutate endpoint', () => {
  it('sets and clears a favorite, and records each mutation', async () => {
    const args = { entityId: areaId, entityType: 'area', userId: user.userId }

    expect(await push('favorites.set', { ...args, saved: true })).toEqual({})
    expect(await favoriteCount(areaId)).toBe(1)

    // Desired state, not a flip: a replayed "save" must not remove it.
    expect(await push('favorites.set', { ...args, saved: true })).toEqual({})
    expect(await favoriteCount(areaId)).toBe(1)

    expect(await push('favorites.set', { ...args, saved: false })).toEqual({})
    expect(await favoriteCount(areaId)).toBe(0)
    expect(await lastMutationID()).toBe(nextId - 1)
  })

  it('refuses a favorite outside the caller regions as an app error, and still advances the client', async () => {
    const result = await push('favorites.set', {
      entityId: foreignAreaId,
      entityType: 'area',
      saved: true,
      userId: user.userId,
    })

    expect(result.error).toBe('app')
    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'areas_notFound' })
    expect(await favoriteCount(foreignAreaId)).toBe(0)
    // Advanced, so zero-cache does not resend it forever.
    expect(await lastMutationID()).toBe(nextId - 1)
  })

  it('runs the write as app_writer with the caller claims, on Zero transaction', async () => {
    const probe = defineMutators(serverMutators, {
      probe: {
        whoami: defineServerMutator(async ({ ctx, tx }) => {
          if (tx.location !== 'server') return
          const [row] = await asCaller(tx, ctx, (db) =>
            db.execute<{ role: string; sub: string }>(
              drizzleSql`select current_user as role, current_setting('request.jwt.claim.sub') as sub`,
            ),
          )
          throw new ApplicationError(said(`${row.role}|${row.sub}`))
        }),
      },
    })

    const result = await push('probe.whoami', undefined, probe as never)

    expect(heard(result.message)).toBe(`app_writer|${user.authId}`)
  })

  it('answers a failure of Zero own bookkeeping generically, never with its SQL', async () => {
    // Still app_writer when Zero records the returned value, which that role may not write.
    const probe = defineMutators(serverMutators, {
      probe: {
        keepRole: defineServerMutator(async ({ ctx, tx }) => {
          await asCaller(tx, ctx, async () => undefined)
          if (tx.location === 'server') await applyRls(tx.dbTransaction.wrappedTransaction, ctx.claims)
          return { secret: 'secret-crag' }
        }),
      },
    })

    const result = await push('probe.keepRole', undefined, probe as never)

    expect(result.error).toBe('app')
    expect(JSON.stringify(result)).not.toContain('secret-crag')
    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'error_server_title' })
  })

  it('stores a failed setup generically too, since the client also reads the stored result', async () => {
    // A failure in the role switch itself, which has to be inside the mapping as well.
    const probe = defineMutators(serverMutators, {
      probe: {
        setupFails: defineServerMutator(async ({ ctx, tx }) => {
          const claims = {
            ...ctx.claims,
            toJSON: () => {
              throw new Error('secret-crag')
            },
          }
          await asCaller(tx, { ...ctx, claims }, async () => undefined)
        }),
      },
    })

    const result = await push('probe.setupFails', undefined, probe as never)

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'error_server_title' })
    const [stored] = await sql<{ result: unknown }[]>`
      select result from zero_0.mutations where "clientGroupID" = ${clientGroupID} and "mutationID" = ${nextId - 1}`
    expect(JSON.stringify(stored?.result)).toContain('error_server_title')
    expect(JSON.stringify(stored?.result)).not.toContain('secret-crag')
  })

  it('drops the afterCommit work of an attempt Zero re-runs', async () => {
    const ran: string[] = []
    let attempts = 0
    const probe = defineMutators(serverMutators, {
      probe: {
        retried: defineServerMutator(async ({ ctx, tx }) => {
          if (tx.location !== 'server') return
          const attempt = ++attempts
          tx.retryOn(() => true)
          ctx.afterCommit(async () => void ran.push(`attempt ${attempt}`))
          if (attempt === 1) throw new Error('serialization failure')
        }),
      },
    })

    expect(await push('probe.retried', undefined, probe as never)).toEqual({})
    expect(ran).toEqual(['attempt 2'])
  })

  it('answers an unexpected error generically, never with its text', async () => {
    const probe = defineMutators(serverMutators, {
      probe: {
        leak: defineServerMutator(async ({ ctx, tx }) => {
          if (tx.location !== 'server') return
          await asCaller(tx, ctx, () => Promise.reject(new Error('row value: secret-crag')))
        }),
      },
    })

    const result = await push('probe.leak', undefined, probe as never)

    expect(result.error).toBe('app')
    expect(result.message).not.toContain('secret-crag')
    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'error_server_title' })
  })
})

describe.skipIf(!reachable)('routes.update mutator', () => {
  const edit = (name: string, known: string | undefined) => ({
    blockId: String(blockId),
    id: String(routeId),
    known,
    name,
  })

  async function storedName() {
    const [row] = await sql<{ name: string }[]>`select name from public.routes where id = ${routeId}`
    return row.name
  }

  it('saves when the fingerprint matches the stored lists', async () => {
    expect(await push('routes.update', edit('__mutate_renamed__', routeListsFingerprint([], [])))).toEqual({
      data: { id: routeId },
    })
    expect(await storedName()).toBe('__mutate_renamed__')
  })

  it('refuses a stale fingerprint as a form-level error and writes nothing', async () => {
    const result = await push('routes.update', edit('__mutate_stale__', 'stale'))

    expect(result.error).toBe('app')
    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'routes_listsStale' })
    expect(result.details).toEqual({ field: null })
    expect(await storedName()).toBe('__mutate_renamed__')
  })

  it('refuses a duplicate name on the name field', async () => {
    const result = await push('routes.update', edit('__mutate_sibling__', routeListsFingerprint([], [])))

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'routes_nameExists' })
    expect(result.details).toEqual({ field: 'name' })
    expect(await storedName()).toBe('__mutate_renamed__')
  })
})

describe.skipIf(!reachable)('privileged mutators', () => {
  type Db = Parameters<Parameters<typeof asPrivileged>[1]>[0]

  // A membership in a region the caller does not administer: RLS refuses it, the login role does not.
  const join = (wrap: 'caller' | 'privileged', thenFail = false) =>
    defineMutators(serverMutators, {
      probe: {
        join: defineServerMutator(async ({ ctx, tx }) => {
          const write = async (db: Db) => {
            await db.execute(drizzleSql`
              insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
              values (${foreignRegionId}, ${user.userId}, ${user.authId}, 'region_user', true)`)
            if (thenFail) {
              throw new ApplicationError(said('after the write'))
            }
          }
          await (wrap === 'caller' ? asCaller(tx, ctx, write) : asPrivileged(tx, write))
        }),
      },
    }) as never

  async function memberships() {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.region_members where region_fk = ${foreignRegionId}`
    return row.count
  }

  it('refuses the write as the caller', async () => {
    expect((await push('probe.join', undefined, join('caller'))).error).toBe('app')
    expect(await memberships()).toBe(0)
  })

  it('rolls a privileged write back with its mutation, and still advances the client', async () => {
    const result = await push('probe.join', undefined, join('privileged', true))

    expect(heard(result.message)).toBe('after the write')
    expect(await memberships()).toBe(0)
    expect(await lastMutationID()).toBe(nextId - 1)
  })

  it('commits a privileged write with its mutation', async () => {
    expect(await push('probe.join', undefined, join('privileged'))).toEqual({})
    expect(await memberships()).toBe(1)
    expect(await lastMutationID()).toBe(nextId - 1)

    await sql`delete from public.region_members where region_fk = ${foreignRegionId}`
  })
})

describe.skipIf(!reachable)('after-commit work', () => {
  const ran: string[] = []

  const deferring = (refuse: boolean) =>
    defineMutators(serverMutators, {
      probe: {
        defer: defineServerMutator(async ({ ctx, tx }) => {
          await asCaller(tx, ctx, async () => {
            ctx.afterCommit(async () => void ran.push(refuse ? 'refused' : 'applied'))
            if (refuse) {
              throw new ApplicationError('refused')
            }
          })
        }),
      },
    }) as never

  it('runs only for a mutation that committed, before the response', async () => {
    await push('probe.defer', undefined, deferring(true))
    await push('probe.defer', undefined, deferring(false))

    expect(ran).toEqual(['applied'])
  })
})

describe('server registry', () => {
  // Leaves of a registry carry `mutatorName`; namespaces are plain objects.
  const names = (node: object, out: string[] = []): string[] => {
    for (const value of Object.values(node)) {
      if (typeof value === 'function' && 'mutatorName' in value) out.push(String(value.mutatorName))
      else if (value != null && typeof value === 'object') names(value, out)
    }
    return out
  }

  it('gives every client mutator its own server def, never the client half', () => {
    const clientNames = names(mutators)
    expect(clientNames.length).toBeGreaterThan(0)

    for (const name of clientNames) {
      expect(mustGetMutator(serverMutators, name).fn).not.toBe(mustGetMutator(mutators, name).fn)
    }
  })
})
