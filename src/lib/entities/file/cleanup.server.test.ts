// @vitest-environment node
/**
 * Tests for `deleteFileRows`, the one place a mistake destroys user media for good.
 *
 * Two rules carry that weight, and both are invisible in a green typecheck:
 *
 *  - **Write ordering.** The circular link (`files.bunny_stream_fk` <-> `bunny_streams.file_fk`,
 *    both ON DELETE SET NULL) means deleting the files first silently nulls `file_fk` and leaves
 *    the stream row behind, orphaning a hosted video that nothing points at any more. The unlink
 *    -> streams -> files order is what prevents that, and only a real database shows it.
 *  - **The DELETE `returning` is the source of truth.** Storage targets come from the rows that
 *    actually came back, not the rows passed in, so a row RLS silently kept keeps its bytes. Get
 *    this wrong and a read-only member's failed delete still wipes the media off the host.
 *
 * So every case runs impersonated (`request.jwt.claims` + `set local role app_writer`, exactly
 * what `createDrizzle` does), inside a transaction that is always rolled back. Fixtures are made
 * over the superuser connection, which bypasses RLS. Skipped when DATABASE_URL is unreachable so
 * `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { imageStoragePaths } from '$lib/images/derivatives'
import { sql as drizzleSql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteFileRows } from './cleanup.server'

const REGION = '__file_cleanup_region__'

const EMAILS = {
  /** region_maintainer: holds region.edit, which is what the files DELETE RLS wants. */
  editor: 'maintainer@grnyte.rocks',
  /** region_user: read only. Deletes nothing but media on their own ascent. */
  reader: 'user@grnyte.rocks',
} as const

/** The drizzle transaction handle the mutations run on (same type as `Context['db']`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type Who = keyof typeof EMAILS

let users = {} as Record<Who, SeedUser>
let regionId = 0

const IMAGE_PATH = '/user-content/cleanup-test.jpg'
const imageFileId = '__cleanup_image__'
const videoFileId = '__cleanup_video__'
/** Media on the reader's OWN ascent: the one file RLS lets them delete. */
const ownAscentFileId = '__cleanup_own_ascent__'
let streamId = ''

/** Rolls back whatever `fn` did, so no case depends on another's writes. */
const ROLLBACK = Symbol('rollback')

/** Runs `fn` as `who`, impersonated the way `createDrizzle` does. Always rolls back. */
async function as<T>(who: Who, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { authId, email } = users[who]
  const claims = JSON.stringify({ email, role: 'authenticated', sub: authId })

  let result!: T
  try {
    await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`select set_config('request.jwt.claims', ${claims}, true)`)
      await tx.execute(drizzleSql.raw('set local role app_writer'))
      result = await fn(tx)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  return result
}

const countFiles = async (id: string) => {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from public.files where id = ${id}`
  return row.n
}

const countStreams = async (id: string) => {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from public.bunny_streams where id = ${id}`
  return row.n
}

async function removeFixtures() {
  const inRegion = sql`(select id from public.regions where name = ${REGION})`
  await sql`update public.files set bunny_stream_fk = null where region_fk in ${inRegion}`
  await sql`delete from public.bunny_streams where region_fk in ${inRegion}`
  await sql`delete from public.files where region_fk in ${inRegion}`
  await sql`delete from public.ascents where region_fk in ${inRegion}`
  await sql`delete from public.routes where region_fk in ${inRegion}`
  await sql`delete from public.blocks where region_fk in ${inRegion}`
  await sql`delete from public.areas where region_fk in ${inRegion}`
  await sql`delete from public.region_members where region_fk in ${inRegion}`
  await sql`delete from public.regions where name = ${REGION}`
}

beforeAll(async () => {
  if (!reachable) return

  users = await seedUsers(EMAILS)
  await removeFixtures()

  const owner = users.editor.userId
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${owner}, 10) returning id`

  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk, invited_by) values
      (${regionId}, 'region_maintainer', true, ${users.editor.authId}, ${users.editor.userId}, ${owner}),
      (${regionId}, 'region_user', true, ${users.reader.authId}, ${users.reader.userId}, ${owner})`

  const [{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by) values ('A', ${regionId}, ${owner}) returning id`
  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, region_fk, created_by, "order", area_fk)
    values ('B', ${regionId}, ${owner}, 0, ${areaId}) returning id`
  const [{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, region_fk, created_by, block_fk)
    values ('R', ${regionId}, ${owner}, ${blockId}) returning id`
  const [{ id: readerAscentId }] = await sql<{ id: number }[]>`
    insert into public.ascents (region_fk, created_by, type, route_fk)
    values (${regionId}, ${users.reader.userId}, 'flash', ${routeId}) returning id`

  // A route-attached image: no ascent, so the reader's own-ascent escape hatch cannot reach it.
  await sql`
    insert into public.files (id, region_fk, path, route_fk, created_by)
    values (${imageFileId}, ${regionId}, ${IMAGE_PATH}, ${routeId}, ${owner})`

  // A video: an empty path plus the circular files <-> bunny_streams link the delete unwinds.
  ;[{ id: streamId }] = await sql<{ id: string }[]>`
    insert into public.bunny_streams (id, region_fk, file_fk) values (gen_random_uuid(), ${regionId}, null)
    returning id`
  await sql`
    insert into public.files (id, region_fk, path, route_fk, created_by, bunny_stream_fk)
    values (${videoFileId}, ${regionId}, '', ${routeId}, ${owner}, ${streamId})`
  await sql`update public.bunny_streams set file_fk = ${videoFileId} where id = ${streamId}`

  await sql`
    insert into public.files (id, region_fk, path, ascent_fk, created_by)
    values (${ownAscentFileId}, ${regionId}, '/user-content/own.jpg', ${readerAscentId}, ${users.reader.userId})`
}, 30_000)

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('deleteFileRows', () => {
  it('returns nothing for an empty batch', async () => {
    const targets = await as('editor', (tx) => deleteFileRows(tx, []))
    expect(targets).toEqual([])
  })

  it('deletes an image row and reports every object it owns in storage', async () => {
    const targets = await as('editor', (tx) =>
      deleteFileRows(tx, [{ bunnyStreamFk: null, id: imageFileId, path: IMAGE_PATH }]),
    )

    expect(targets).toEqual([
      {
        images: [
          '/user-content/cleanup-test.jpg',
          '/user-content/cleanup-test.256.webp',
          '/user-content/cleanup-test.1024.webp',
          '/user-content/cleanup-test.orig.heic',
          '/user-content/cleanup-test.orig.heif',
        ],
      },
    ])
  })

  it('deletes the stream row with the video, so no hosted clip is orphaned', async () => {
    const { streams, targets } = await as('editor', async (tx) => {
      const targets = await deleteFileRows(tx, [{ bunnyStreamFk: streamId, id: videoFileId, path: '' }])
      // Read inside the transaction: the rollback in `as` puts both rows back afterwards.
      const streams = await tx.execute<{ n: number }>(
        drizzleSql`select count(*)::int as n from public.bunny_streams where id = ${streamId}`,
      )
      return { streams: streams[0].n, targets }
    })

    // The guid comes from the pre-unlink row, so it survives the `set bunny_stream_fk = null`.
    expect(targets).toEqual([{ video: streamId }])
    expect(streams).toBe(0)
  })

  it('reports no storage target for a row RLS kept, so its bytes survive a refused delete', async () => {
    const targets = await as('reader', (tx) =>
      deleteFileRows(tx, [{ bunnyStreamFk: null, id: imageFileId, path: IMAGE_PATH }]),
    )

    expect(targets).toEqual([])
    expect(await countFiles(imageFileId)).toBe(1)
  })

  it('reports only the deletable half of a mixed batch', async () => {
    // The reader may delete media on their own ascent, but not the route image next to it.
    const targets = await as('reader', (tx) =>
      deleteFileRows(tx, [
        { bunnyStreamFk: null, id: imageFileId, path: IMAGE_PATH },
        { bunnyStreamFk: null, id: ownAscentFileId, path: '/user-content/own.jpg' },
      ]),
    )

    expect(targets).toEqual([{ images: imageStoragePaths('/user-content/own.jpg') }])
  })

  it('leaves every fixture row intact, since each case rolls back', async () => {
    expect(await countFiles(imageFileId)).toBe(1)
    expect(await countFiles(videoFileId)).toBe(1)
    expect(await countFiles(ownAscentFileId)).toBe(1)
    expect(await countStreams(streamId)).toBe(1)
  })
})
