/**
 * A refused video finalize has to take its Bunny asset back.
 *
 * The bytes are already at Bunny by the time `finalizeVideo` runs (the client awaits TUS), and the
 * sweeper cannot see a video that got past status 0, so a refusal here strands it forever rather
 * than until the next sweep. The provider is mocked: this is about what the handler does on the way
 * out, not about Bunny.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const remove = vi.fn<(videoId: string) => Promise<void>>(async () => {})

vi.mock('$lib/videos/provider.server', () => ({
  getVideoProvider: () => ({
    createUpload: vi.fn(),
    listStaleUploads: vi.fn(async () => []),
    remove,
    verifyUpload: () => true,
  }),
}))

const { finalizeVideo } = await import('./files.remote')

const REGION = '__finalize_region__'
const VIDEO_ID = '3f1c9e64-0a2b-4d7e-9c31-8b5a6d2f4e10'

let reader: SeedUser
let regionId = 0
let areaId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ reader: 'user@grnyte.rocks' })
  reader = users.reader

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${reader.userId}) returning id`
  regionId = region.id

  // READ only: enough to be a member, not enough to attach media to an area.
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${reader.userId}, ${reader.authId}, 'region_user', true)`

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by)
    values ('__finalize_area__', ${regionId}, ${reader.userId}) returning id`
  areaId = area.id
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.files where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('finalizeVideo', () => {
  it('takes the Bunny video back when the attach is refused', async () => {
    remove.mockClear()

    // A real refusal, not a mocked one: a READ member may not attach media to an area, so
    // resolveAttachRegion raises 403 after verifyUpload has already proved ownership.
    const status = await statusOf(() =>
      asRequest(reader.authId, () =>
        finalizeVideo({ entityId: areaId, entityType: 'area', token: 'proven', videoId: VIDEO_ID }),
      ),
    )

    expect(status, 'the caller still gets the real refusal').toBe(403)
    expect(remove, 'and the asset is reclaimed rather than stranded').toHaveBeenCalledWith(VIDEO_ID)

    const [rows] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.files where region_fk = ${regionId}`
    expect(rows.count, 'and nothing was written').toBe(0)
  })

  describe('when the insert fails after the region check', () => {
    const FAIL_ID = '7a1d2c33-5b6e-4f80-9a12-3c4d5e6f7a81'
    const REPLAY_ID = '9b2e3d44-6c7f-4a91-8b23-4d5e6f7a8b92'
    let maintainer: SeedUser

    beforeAll(async () => {
      if (!reachable) return
      maintainer = (await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })).maintainer
      await sql`
        insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
        values (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)`
      // Fails the stream insert the way a real fault would, after the region check has passed.
      await sql.unsafe(`
        create or replace function public.__finalize_test_fail() returns trigger language plpgsql as $$
        begin
          if new.id = '${FAIL_ID}'::uuid then raise exception 'boom'; end if;
          if new.id = '${REPLAY_ID}'::uuid then raise exception 'dup' using errcode = '23505'; end if;
          return new;
        end $$`)
      await sql`
        create trigger __finalize_test_fail before insert on public.bunny_streams
        for each row execute function public.__finalize_test_fail()`
    })

    afterAll(async () => {
      if (!reachable) return
      await sql`drop trigger if exists __finalize_test_fail on public.bunny_streams`
      await sql`drop function if exists public.__finalize_test_fail()`
    })

    const attach = (videoId: string) =>
      asRequest(maintainer.authId, () =>
        finalizeVideo({ entityId: areaId, entityType: 'area', token: 'proven', videoId }),
      )

    it('leaves the video for a retry when the database faults', async () => {
      remove.mockClear()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(attach(FAIL_ID)).rejects.toThrow()
      // A fault is not a refusal: deleting would turn the client's retry into a re-upload.
      expect(remove).not.toHaveBeenCalled()

      const [rows] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.files where region_fk = ${regionId}`
      expect(rows.count, 'and the file row rolled back').toBe(0)
    })

    it('leaves a video that is already attached alone', async () => {
      remove.mockClear()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(attach(REPLAY_ID)).rejects.toThrow()
      expect(remove).not.toHaveBeenCalled()
    })
  })

  it('still reports the refusal when the reclaim itself fails', async () => {
    // A failing DELETE at Bunny must not replace the 403: a 502 here would invite the client to
    // retry a request that can only ever be refused.
    remove.mockClear()
    remove.mockRejectedValueOnce(new Error('bunny down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const status = await statusOf(() =>
      asRequest(reader.authId, () =>
        finalizeVideo({ entityId: areaId, entityType: 'area', token: 'proven', videoId: VIDEO_ID }),
      ),
    )

    expect(status, 'the caller still sees the refusal, not a video-host error').toBe(403)
  })
})
