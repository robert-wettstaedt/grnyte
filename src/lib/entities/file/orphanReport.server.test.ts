/**
 * The orphan report is a diff, so its blast radius is everything it cannot account for.
 *
 * Three properties, none visible from the happy path: it subtracts the videos that ARE attached,
 * it refuses rather than reports when the candidates are an implausible share of what it examined
 * (which is what a short `bunny_streams` read looks like from here), and it never deletes.
 *
 * Calls the report directly, NOT the cron route: driving that would run the notification and
 * feedback retention deletes against the shared dev database on every `npm test`.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const remove = vi.fn(async () => {})
const listVideos = vi.fn(async () => ({ guids: [] as string[], total: 0 }))

vi.mock('$lib/videos/provider.server', () => ({
  getVideoProvider: () => ({
    createUpload: vi.fn(),
    listStaleUploads: vi.fn(async () => []),
    listVideos,
    remove,
    verifyUpload: () => true,
  }),
}))

const { reportBunnyOrphans } = await import('./cleanup.server')

const REGION = '__orphan_region__'
const ATTACHED = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORPHAN = 'bbbbbbbb-0000-4000-8000-000000000002'
const ORPHAN2 = 'cccccccc-0000-4000-8000-000000000003'

let owner: SeedUser
let regionId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ owner: 'user@grnyte.rocks' })
  owner = users.owner

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${owner.userId}) returning id`
  regionId = region.id

  await sql`insert into public.bunny_streams (id, region_fk) values (${ATTACHED}, ${regionId})`
})

afterEach(() => {
  vi.restoreAllMocks()
  remove.mockClear()
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.bunny_streams where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

/** Run the report, capturing what it logged. */
async function run(): Promise<string> {
  const logs: unknown[][] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logs.push(args))
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void logs.push(args))
  await reportBunnyOrphans(db, new Date())
  return JSON.stringify(logs)
}

describe.skipIf(!reachable)('reportBunnyOrphans', () => {
  it('names only the video with no bunny_streams row, and deletes nothing', async () => {
    listVideos.mockResolvedValue({ guids: [ATTACHED, ORPHAN], total: 10 })

    const output = await run()

    expect(output, 'the unattached one is reported').toContain(ORPHAN)
    expect(output, 'the attached one is not').not.toContain(ATTACHED)
    expect(remove, 'and reporting never deletes').not.toHaveBeenCalled()
  })

  it('refuses when the candidates are an implausible share of what it examined', async () => {
    listVideos.mockResolvedValue({ guids: [ORPHAN, ORPHAN2, ATTACHED], total: 10_000 })

    const output = await run()

    expect(output, 'it shouts instead').toContain('refusing an implausible orphan set')
    expect(output, 'and does not list them').not.toContain(ORPHAN)
  })

  it('never throws, so a Bunny outage cannot cost a retention delete', async () => {
    listVideos.mockRejectedValue(new Error('bunny 502'))

    const output = await run()

    expect(output, 'the failure is reported, not raised').toContain('orphan report failed')
  })
})
