/**
 * `finalizeImage` claims the staged object, so a double submit or a retry cannot insert twice.
 * Image storage and the staging bucket are faked (the bucket claims atomically, like Storage's move).
 */
import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.fn<(path: string, data: Buffer) => Promise<void>>(async () => {})

vi.mock('$lib/images/provider.server', () => ({
  getImageProvider: () => ({ remove: vi.fn(async () => {}), store }),
}))

const { finalizeImage } = await import('./files.remote')

const REGION = '__finalize_image_region__'

let maintainer: SeedUser
let regionId = 0
let areaId = 0
let png: Buffer
let staging: Map<string, Buffer>
let failRemove = false
let failRead = false

const bucket = () => ({
  download: async (path: string) =>
    !staging.has(path)
      ? { data: null, error: {} }
      : failRead
        ? { data: { arrayBuffer: () => Promise.reject(new Error('stream reset')) }, error: null }
        : { data: new Blob([new Uint8Array(staging.get(path)!)]), error: null },
  move: async (from: string, to: string) => {
    const bytes = staging.get(from)
    if (bytes == null) return { error: {} }
    staging.delete(from)
    staging.set(to, bytes)
    return { error: null }
  },
  remove: async (paths: string[]) => {
    if (failRemove) return { error: {} }
    for (const path of paths) staging.delete(path)
    return { error: null }
  },
})
const fakeSupabase = { storage: { from: bucket } }

const call = (stagingPath: string) =>
  asRequest(maintainer.authId, () => finalizeImage({ entityId: areaId, entityType: 'area', stagingPath }), fakeSupabase)
const finalize = (stagingPath: string) => statusOf(() => call(stagingPath))
const fileCount = async () => (await sql`select id from public.files where region_fk = ${regionId}`).length

beforeAll(async () => {
  if (!reachable) return

  const seeded = await seedRegion(REGION)
  maintainer = seeded.user
  regionId = seeded.regionId
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__finalize_image_area__', 'sector', ${regionId}, ${maintainer.userId}) returning id`
  areaId = area.id
  png = await sharp({ create: { background: '#fff', channels: 3, height: 4, width: 4 } })
    .png()
    .toBuffer()
})

beforeEach(async () => {
  if (!reachable) return
  staging = new Map([['u/a.png', png]])
  failRemove = false
  failRead = false
  store.mockClear()
  store.mockImplementation(async () => {})
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.files where region_fk = ${regionId}`
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.files where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('finalizeImage', () => {
  it('creates one file when the same staged upload is finalized twice at once', async () => {
    const statuses = await Promise.all([finalize('u/a.png'), finalize('u/a.png')])

    expect(statuses.filter((status) => status === undefined)).toHaveLength(1)
    expect(statuses.filter((status) => status === 400)).toHaveLength(1)
    expect(await fileCount()).toBe(1)
  })

  it('does not create a second file on a retry after the staging cleanup failed', async () => {
    failRemove = true

    expect(await finalize('u/a.png')).toBeUndefined()
    expect(await finalize('u/a.png')).toBe(400)
    expect(await fileCount()).toBe(1)
  })

  it('hands the staged upload back when storing fails, so the retry succeeds', async () => {
    store.mockRejectedValueOnce(new Error('nextcloud down'))

    await expect(call('u/a.png')).rejects.toThrow('nextcloud down')
    expect(staging.has('u/a.png')).toBe(true)
    expect(await finalize('u/a.png')).toBeUndefined()
    expect(await fileCount()).toBe(1)
  })

  it('hands the staged upload back when reading it throws', async () => {
    failRead = true
    await expect(call('u/a.png')).rejects.toThrow('stream reset')
    expect(staging.has('u/a.png')).toBe(true)

    failRead = false
    expect(await finalize('u/a.png')).toBeUndefined()
  })
})
