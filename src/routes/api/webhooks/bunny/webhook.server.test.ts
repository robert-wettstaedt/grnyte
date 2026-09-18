// @vitest-environment node
/**
 * The promote-only guarantee, against a real database. Bunny documents no delivery order, so a late
 * `Encoding` can arrive after `Finished` and would otherwise un-publish a working video.
 */
import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'read-only-key'
const LIBRARY = '383888'

vi.mock('$env/static/public', () => ({ PUBLIC_BUNNY_STREAM_LIBRARY_ID: LIBRARY }))
vi.mock('$env/static/private', async () => {
  await import('dotenv/config')
  return {
    BUNNY_STREAM_API_KEY: 'full-key',
    BUNNY_STREAM_READ_ONLY_KEY: SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  }
})

const { reachable, seedRegion, sql } = await import('$lib/db/testDb')
const { POST } = await import('./+server')

const GUID = '00000000-0000-4000-8000-00000000f00d'
const UNKNOWN_GUID = '00000000-0000-4000-8000-00000000dead'

const post = (status: number, guid = GUID, sign = true) => {
  const body = JSON.stringify({ Status: status, VideoGuid: guid, VideoLibraryId: Number(LIBRARY) })
  const headers = new Headers({
    'X-BunnyStream-Signature': createHmac('sha256', sign ? SECRET : 'wrong')
      .update(body, 'utf8')
      .digest('hex'),
    'X-BunnyStream-Signature-Algorithm': 'hmac-sha256',
    'X-BunnyStream-Signature-Version': 'v1',
  })
  return POST({
    request: new Request('http://localhost/api/webhooks/bunny', { body, headers, method: 'POST' }),
  } as never)
}

const readinessOf = async (guid: string) => {
  const rows = await sql<{ readiness: string }[]>`select readiness from bunny_streams where id = ${guid}`
  return rows[0]?.readiness
}

const FILE_ID = 'zwebhooktestfileaaaaaaaa'

const removeFixtures = async () => {
  await sql`delete from notifications where source_type = 'video_ready' and file_fk = ${FILE_ID}`
  await sql`update files set bunny_stream_fk = null where id = ${FILE_ID}`
  await sql`delete from bunny_streams where id in (${GUID}, ${UNKNOWN_GUID})`
  await sql`delete from files where id = ${FILE_ID}`
}

/** Its own region and uploader, because the mutation runner builds an empty Postgres per worker. */
let regionId = 0
let uploaderId = 0

/** `uploadedMinutesAgo` crosses the notification threshold; a small value sits inside it. */
const seed = async (uploadedMinutesAgo: number) => {
  await removeFixtures()
  // files and bunny_streams reference each other, so the link needs a third statement.
  await sql`
    insert into files (id, region_fk, created_by, path, created_at)
    values (${FILE_ID}, ${regionId}, ${uploaderId}, '',
            now() - (${uploadedMinutesAgo} || ' minutes')::interval)`
  await sql`
    insert into bunny_streams (id, region_fk, file_fk, readiness)
    values (${GUID}, ${regionId}, ${FILE_ID}, 'pending')`
  await sql`update files set bunny_stream_fk = ${GUID} where id = ${FILE_ID}`
}

const videoReadyCount = async () => {
  const rows = await sql<{ count: string }[]>`
    select count(*) from notifications where source_type = 'video_ready' and file_fk = ${FILE_ID}`
  return Number(rows[0].count)
}

describe.skipIf(!reachable)('bunny webhook', () => {
  beforeAll(async () => {
    const seeded = await seedRegion('__bunny_webhook_region__')
    regionId = seeded.regionId
    uploaderId = seeded.user.userId
  })

  beforeEach(async () => {
    await seed(30)
  })

  afterAll(async () => {
    await removeFixtures()
    await sql`delete from region_members where region_fk = ${regionId}`
    await sql`delete from regions where id = ${regionId}`
    await sql.end()
  })

  it('promotes to ready on Finished', async () => {
    expect((await post(3)).status).toBe(204)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  it('promotes to ready on ResolutionFinished, before the rest of the renditions land', async () => {
    expect((await post(4)).status).toBe(204)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  // Passes on `promoteReadiness`'s early return for a pending mapping, not on the guard. The next
  // test covers the guard.
  it('does NOT demote when a late Encoding arrives after Finished', async () => {
    await post(3)
    await post(2)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  // What `ne(readiness, 'ready')` buys, which is not the row count: `notify`'s unique index
  // collapses that. Its `setWhere` nulls `readAt` on a conflict, so an ungated redelivery marks the
  // notification unread and pushes it again.
  it('does not resurface a read notification when Finished is redelivered', async () => {
    await post(3)
    expect(await videoReadyCount()).toBe(1)
    await sql`update notifications set read_at = now() where source_type = 'video_ready' and file_fk = ${FILE_ID}`

    await post(3)
    await post(4)

    expect(await readinessOf(GUID)).toBe('ready')
    expect(await videoReadyCount()).toBe(1)
    const rows = await sql<{ read_at: Date | null }[]>`
      select read_at from notifications where source_type = 'video_ready' and file_fk = ${FILE_ID}`
    expect(rows[0].read_at).not.toBeNull()
  })

  // A minute, not zero: at zero the elapsed time is milliseconds, and a shrunken NOTIFY_AFTER_MS
  // still passes.
  it('does not notify when the upload was recent', async () => {
    await seed(1)
    await post(3)
    expect(await readinessOf(GUID)).toBe('ready')
    expect(await videoReadyCount()).toBe(0)
  })

  it('does not move a ready video to failed', async () => {
    await post(3)
    await post(5)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  it('records failed from pending', async () => {
    expect((await post(5)).status).toBe(204)
    expect(await readinessOf(GUID)).toBe('failed')
  })

  it('ignores events that say nothing about playability', async () => {
    for (const status of [6, 7, 8, 9, 10]) {
      expect((await post(status)).status).toBe(204)
    }
    expect(await readinessOf(GUID)).toBe('pending')
  })

  it('rejects an unverified request and changes nothing', async () => {
    expect((await post(3, GUID, false)).status).toBe(401)
    expect(await readinessOf(GUID)).toBe('pending')
  })

  it('is a no-op for an unknown guid, never an insert', async () => {
    expect((await post(3, UNKNOWN_GUID)).status).toBe(204)
    expect(await readinessOf(UNKNOWN_GUID)).toBeUndefined()
  })
})
