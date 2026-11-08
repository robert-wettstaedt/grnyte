/**
 * The running sync service, through a headless client: what a connected device sees when membership changes,
 * when it names a region it does not belong to, and when it catches up after the server compacted its history.
 *
 * Needs the local service (`deployment/docker-compose.powersync.local.yml`) on the shared dev database, so it runs
 * only with POWERSYNC_LOCAL=1, plus DATABASE_URL, E2E_PASSWORD and PUBLIC_SUPABASE_ANON_KEY.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PsClient, signIn } from '../../../scripts/powersync/client'

const ENABLED = reachable && process.env.POWERSYNC_LOCAL === '1'
const ENDPOINT = process.env.POWERSYNC_URL ?? 'http://localhost:58100'
const REGION = '__streams_local__'

let member: SeedUser
let region = 0
let routeIds: number[] = []
const tokens: Record<string, string> = {}
const clients: PsClient[] = []

function client(email: string, options: Partial<ConstructorParameters<typeof PsClient>[0]> = {}) {
  const made = new PsClient({ endpoint: ENDPOINT, token: tokens[email], ...options })
  clients.push(made)
  return made
}

async function waitFor(check: () => boolean, ms = 20_000) {
  const until = Date.now() + ms
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting for the client')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

const regionRows = (c: PsClient) => [...c.rows.values()].filter((row) => Number(row.data.region_fk) === region)

beforeAll(async () => {
  if (!ENABLED) return
  ;({ member } = await seedUsers({ member: 'user@grnyte.rocks' }))
  for (const email of ['user@grnyte.rocks', 'anon@grnyte.rocks']) {
    tokens[email] = await signIn({
      anonKey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
      authUrl: process.env.AUTH_URL ?? 'http://localhost:8000',
      email,
      password: process.env.E2E_PASSWORD ?? '',
    })
  }
  await sql`delete from public.routes where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.blocks where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.areas where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.regions where name = ${REGION}`
  ;[{ id: region }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${member.userId}, 10) returning id`
  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk)
    values (${region}, 'region_user', true, ${member.authId}, ${member.userId})`
  const [{ id: areaFk }] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by) values ('__streams_local_area__', ${region}, ${member.userId})
    returning id`
  const [{ id: blockFk }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values ('__streams_local_block__', 0, ${areaFk}, ${region}, ${member.userId}) returning id`
  routeIds = (
    await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      select 'r' || n, ${blockFk}, ${region}, ${member.userId} from generate_series(1, 3) n returning id`
  ).map((row) => row.id)
}, 60_000)

afterAll(async () => {
  for (const c of clients) c.disconnect()
  if (ENABLED) {
    await sql`delete from public.routes where region_fk = ${region}`
    await sql`delete from public.blocks where region_fk = ${region}`
    await sql`delete from public.areas where region_fk = ${region}`
    await sql`delete from public.region_members where region_fk = ${region}`
    await sql`delete from public.regions where id = ${region}`
  }
  await sql.end()
})

describe.skipIf(!ENABLED)('the sync service as a device sees it', () => {
  it('removes a region from a connected device once the membership is deactivated', async () => {
    const device = client('user@grnyte.rocks')
    await device.connect()
    await waitFor(() => regionRows(device).length >= 5)

    await sql`update public.region_members set is_active = false where region_fk = ${region}`
    try {
      await waitFor(() => regionRows(device).length === 0)
    } finally {
      await sql`update public.region_members set is_active = true where region_fk = ${region}`
    }
    expect(regionRows(device)).toEqual([])
  }, 60_000)

  it('answers a subscription naming a foreign region the same as one naming no region at all', async () => {
    const named = client('anon@grnyte.rocks', {
      subscriptions: [{ parameters: { region_id: region }, stream: 'guidebook' }],
    })
    const unknown = client('anon@grnyte.rocks', {
      subscriptions: [{ parameters: { region_id: 2_000_000_000 }, stream: 'guidebook' }],
    })
    await Promise.allSettled([named.connect(), unknown.connect()])

    expect(regionRows(named)).toEqual([])
    expect(named.errors).toEqual(unknown.errors)
  })

  it('catches up with only what changed after the server compacted its history', async () => {
    const device = client('user@grnyte.rocks', { streams: ['guidebook'] })
    await device.connect()
    await waitFor(() => regionRows(device).length >= 5)
    device.disconnect()

    for (const round of [1, 2]) {
      await sql`update public.routes set name = ${'v' + round} || '-' || id where id = any(${routeIds})`
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
    // `compact` starts its own server, so beside the running service it needs ports of its own.
    const compact = [
      'rm -rf /tmp/compact',
      'cp -r /config /tmp/compact',
      "sed -i -e 's/^port: 8080/port: 8091/' -e 's/prometheus_port: 9464/prometheus_port: 9465/' /tmp/compact/service.yaml",
      'node service/lib/entry.js compact -c /tmp/compact/service.yaml',
    ].join(' && ')
    execFileSync('docker', ['exec', 'grnyte-powersync-powersync-1', 'sh', '-c', compact], { stdio: 'ignore' })

    await device.connect()
    const routes = device.table('routes').filter((row) => Number(row.region_fk) === region)

    expect(routes.map((row) => row.name).sort()).toEqual(routeIds.map((id) => `v2-${id}`).sort())
    // Two updates of three rows, compacted or not: never more than six operations, never the region again.
    expect(device.ops).toBeLessThanOrEqual(6)
  }, 60_000)
})
