// @vitest-environment node
/**
 * A public file's two doors, `/image` (bytes) and `/f/<id>` (page): a soft-deleted parent closes
 * both to non-members, and a signed-in non-member gets the anonymous payload. Real database.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { load } from '../../f/[id]/+page.server'
import { GET } from './+server'

vi.mock('$lib/images/provider.server', () => ({
  getImageProvider: () => {
    const payload = async () => ({
      data: new ArrayBuffer(1),
      headers: new Headers(),
      status: 200,
      statusText: 'OK',
    })
    return { fetchOriginal: payload, fetchThumbnail: payload }
  },
}))

let member: SeedUser
let outsider: SeedUser
let regionId = 0
let areaId = 0
let routeId = 0
let blockId = 0
let liveFile = ''
let deletedFile = ''

const livePath = '/__public_file__/live.jpg'
const deletedPath = '/__public_file__/deleted.jpg'

const insertFile = async (id: string, path: string, parent: { area?: number; route?: number }) => {
  await sql`
    insert into public.files (id, region_fk, path, area_fk, route_fk, visibility, created_by)
    values (${id}, ${regionId}, ${path}, ${parent.area ?? null}, ${parent.route ?? null}, 'public', ${member.userId})`
}

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion('__public_file_region__')
  member = seeded.user
  regionId = seeded.regionId
  outsider = await createThrowawayUser('public_file')

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__public_file_area__', 'area', ${regionId}, ${member.userId}) returning id`
  areaId = area.id
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__public_file_block__', ${areaId}, ${regionId}, ${member.userId}, 0) returning id`
  blockId = block.id
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__public_file_route__', ${blockId}, ${regionId}, ${member.userId}) returning id`
  routeId = route.id
  const [dead] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by, deleted_at)
    values ('__public_file_dead__', 'area', ${regionId}, ${member.userId}, now()) returning id`

  liveFile = 'publicfilelive000000000001'
  deletedFile = 'publicfiledeleted0000000001'
  await insertFile(liveFile, livePath, { route: routeId })
  await insertFile(deletedFile, deletedPath, { area: dead.id })
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.files where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
    await dropThrowawayUser(outsider)
  }
  await sql.end()
})

const image = (path: string, userRegions: App.Locals['userRegions']) =>
  GET({
    locals: { userRegions },
    params: { resourcePath: path },
    request: new Request('http://localhost/image'),
    url: new URL('http://localhost/image'),
  } as never)

const page = (id: string, locals: object) => load({ locals, params: { id } } as never)

describe.skipIf(!reachable)('/image for a public file', () => {
  it('serves a live parent to an anonymous caller', async () => {
    const res = await image(livePath, [])
    expect(res.status).toBe(200)
  })

  it('404s an anonymous caller once the parent is soft-deleted', async () => {
    expect(await statusOf(() => image(deletedPath, []))).toBe(404)
  })

  it('still serves a member of the region', async () => {
    const { userRegions } = await getUserPermissions(member.authId)
    const res = await image(deletedPath, userRegions)
    expect(res.status).toBe(200)
  })
})

describe.skipIf(!reachable)('/f/<id> payload for a public file', () => {
  it('zeroes region and entity ids for a signed-in non-member', async () => {
    const { userRegions } = await getUserPermissions(outsider.authId)
    const out = (await page(liveFile, { claims: { sub: outsider.authId }, userRegions })) as {
      controls: null | { parent: unknown }
      file: { regionFk: number; route?: { id: number } }
    }
    expect(out.file.regionFk).toBe(0)
    expect(out.file.route?.id).toBe(0)
    // The toolbar travels too, and its parent is an id like the ones above.
    expect(out.controls?.parent).toBeNull()
  })

  it('keeps them for a member', async () => {
    const { userRegions } = await getUserPermissions(member.authId)
    const out = (await page(liveFile, { claims: { sub: member.authId }, userRegions })) as {
      controls: null | { parent: unknown }
      file: { regionFk: number; route?: { id: number } }
    }
    expect(out.file.regionFk).toBe(regionId)
    expect(out.file.route?.id).toBe(routeId)
    expect(out.controls?.parent).toEqual({ id: routeId, type: 'route' })
  })

  it('404s a soft-deleted parent to a non-member', async () => {
    expect(await statusOf(() => page(deletedFile, { claims: null, userRegions: [] }))).toBe(404)
  })
})
