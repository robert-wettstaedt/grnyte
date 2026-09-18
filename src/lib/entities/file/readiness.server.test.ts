// @vitest-environment node
/**
 * `promoteReadiness` imported directly, against a real database. The webhook route already covers
 * the behaviour, but the mutation runner drives `vitest related` and cannot target a module it
 * reaches only transitively.
 */
import { db } from '$lib/db/db.server'
import { bunnyStreams } from '$lib/db/schema'
import { reachable, seedRegion, sql } from '$lib/db/testDb'
import type { VideoProvider } from '$lib/videos/provider.server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { HostAnswer } from './dto'
import { promoteReadiness, reconcileReadiness } from './readiness.server'

const GUID = '00000000-0000-4000-8000-00000000b0b0'
const UNKNOWN = '00000000-0000-4000-8000-00000000c0de'
const FILE_ID = 'zreadinessservertestfile'

/** GUIDs the sweep tests own. The sweep is global by design, so a stub answers `undefined` for
 *  anything else and other suites' pending rows contribute nothing to the counts here. */
const SWEEP = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, 'e')}`)

/** Its own region, because the mutation runner builds an empty Postgres per worker. */
let regionId = 0

let uploaderId = 0

const seed = async () => {
  await sql`update bunny_streams set file_fk = null where id = ${GUID}`
  await sql`delete from files where id = ${FILE_ID}`
  await sql`delete from bunny_streams where id in (${GUID}, ${UNKNOWN})`
  await sql`
    insert into bunny_streams (id, region_fk, readiness)
    values (${GUID}, ${regionId}, 'pending')`
}

const readinessOf = async (guid: string) => {
  const [row] = await db
    .select({ readiness: bunnyStreams.readiness })
    .from(bunnyStreams)
    .where(eq(bunnyStreams.id, guid))
  return row?.readiness
}

const setReadiness = async (value: string) => {
  await sql`update bunny_streams set readiness = ${value} where id = ${GUID}`
}

describe.skipIf(!reachable)('promoteReadiness', () => {
  beforeAll(async () => {
    const seeded = await seedRegion('__readiness_server_region__')
    regionId = seeded.regionId
    uploaderId = seeded.user.userId
  })

  beforeEach(seed)

  afterAll(async () => {
    await sql`delete from notifications where source_type = 'video_ready' and file_fk = ${FILE_ID}`
    await sql`update bunny_streams set file_fk = null where id = ${GUID}`
    await sql`delete from files where id = ${FILE_ID}`
    await sql`delete from bunny_streams where id in (${GUID}, ${UNKNOWN})`
    await sql`delete from region_members where region_fk = ${regionId}`
    await sql`delete from regions where id = ${regionId}`
    await sql.end()
  })

  it('promotes pending to ready and reports that a row moved', async () => {
    expect(await promoteReadiness(GUID, 'ready')).toBe(true)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  it('records failed from pending', async () => {
    expect(await promoteReadiness(GUID, 'failed')).toBe(true)
    expect(await readinessOf(GUID)).toBe('failed')
  })

  // The sweep counts what this returns, so a false "corrected" is its own defect.
  it('refuses to move a ready row to failed, and reports no move', async () => {
    await setReadiness('ready')
    expect(await promoteReadiness(GUID, 'failed')).toBe(false)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  // A redelivered Finished must not re-run the notify path, and an empty `moved` is what stops it.
  it('reports no move when a ready row is promoted to ready again', async () => {
    await setReadiness('ready')
    expect(await promoteReadiness(GUID, 'ready')).toBe(false)
  })

  // `failed` is not terminal against a later real answer. A webhook that does arrive still wins.
  it('allows failed to be promoted to ready', async () => {
    await setReadiness('failed')
    expect(await promoteReadiness(GUID, 'ready')).toBe(true)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  it('never writes pending, and touches nothing when asked to', async () => {
    await setReadiness('ready')
    expect(await promoteReadiness(GUID, 'pending')).toBe(false)
    expect(await readinessOf(GUID)).toBe('ready')
  })

  // Pins the early return, not the guard: `eq(readiness, 'pending')` matches here, so without the
  // return the row is rewritten with the value it already had and the sweep counts it as work.
  it('reports no move when a pending row is promoted to pending', async () => {
    expect(await promoteReadiness(GUID, 'pending')).toBe(false)
    expect(await readinessOf(GUID)).toBe('pending')
  })

  // A redelivered Failed. Pins the failed branch using `eq(..., 'pending')`, not `ne(..., 'ready')`.
  it('reports no move when a failed row is promoted to failed again', async () => {
    await setReadiness('failed')
    expect(await promoteReadiness(GUID, 'failed')).toBe(false)
    expect(await readinessOf(GUID)).toBe('failed')
  })

  it('is a no-op for an unknown guid rather than an insert', async () => {
    expect(await promoteReadiness(UNKNOWN, 'ready')).toBe(false)
    expect(await readinessOf(UNKNOWN)).toBeUndefined()
  })

  /**
   * The sweep, which is the half that was living in the cron route with no test at all. Its budget,
   * its ordering and its error isolation are all decisions with stated failure modes.
   */
  describe('reconcileReadiness', () => {
    /** Answers for the sweep's own GUIDs and says nothing about any other, so a pending row left by
     *  a suite running in parallel cannot move and cannot change a count asserted here. */
    const host = (answers: Record<string, HostAnswer | undefined>, throwFor: string[] = []) => {
      const asked: string[] = []
      const provider = {
        readinessOf: async (guid: string) => {
          asked.push(guid)
          if (throwFor.includes(guid)) {
            throw new Error('host is down')
          }
          return answers[guid]
        },
      } as unknown as VideoProvider
      return { asked, provider }
    }

    const seedSweep = async (count: number) => {
      await sql`delete from bunny_streams where id = any(${SWEEP})`
      await sql`
        insert into bunny_streams (id, region_fk, readiness)
        select unnest(${SWEEP.slice(0, count)}::uuid[]), ${regionId}, 'pending'`
    }

    afterEach(async () => {
      await sql`delete from bunny_streams where id = any(${SWEEP})`
    })

    it('corrects a row whose webhook never arrived', async () => {
      await seedSweep(1)
      const { provider } = host({ [SWEEP[0]]: 'ready' })
      expect(await reconcileReadiness(provider)).toBe(1)
      expect(await readinessOf(SWEEP[0])).toBe('ready')
    })

    it('records a genuine failure, which comes from the status and not from an absence', async () => {
      await seedSweep(1)
      const { provider } = host({ [SWEEP[0]]: 'failed' })
      expect(await reconcileReadiness(provider)).toBe(1)
      expect(await readinessOf(SWEEP[0])).toBe('failed')
    })

    // The whole reason `gone` exists as its own answer. One 404 is indistinguishable from a blip,
    // and `failed` is a one-way door, so acting on it would strand a good video permanently.
    it('writes nothing for gone, so one 404 cannot strand a good video', async () => {
      await seedSweep(1)
      const { provider } = host({ [SWEEP[0]]: 'gone' })
      expect(await reconcileReadiness(provider)).toBe(0)
      expect(await readinessOf(SWEEP[0])).toBe('pending')
    })

    it('writes nothing when the host said nothing about playability', async () => {
      await seedSweep(1)
      const { provider } = host({ [SWEEP[0]]: undefined })
      expect(await reconcileReadiness(provider)).toBe(0)
      expect(await readinessOf(SWEEP[0])).toBe('pending')
    })

    // Still pending is not a correction, and counting the no-op write would report work not done.
    it('does not count a row the host still calls pending', async () => {
      await seedSweep(1)
      const { provider } = host({ [SWEEP[0]]: 'pending' })
      expect(await reconcileReadiness(provider)).toBe(0)
      expect(await readinessOf(SWEEP[0])).toBe('pending')
    })

    it('never asks about a row that is already ready, because only pending rows can be stale', async () => {
      await seedSweep(1)
      await sql`update bunny_streams set readiness = 'ready' where id = ${SWEEP[0]}`
      const { asked, provider } = host({ [SWEEP[0]]: 'failed' })
      expect(await reconcileReadiness(provider)).toBe(0)
      expect(asked).not.toContain(SWEEP[0])
      expect(await readinessOf(SWEEP[0])).toBe('ready')
    })

    it('isolates a host failure, so one dead lookup does not abort the rest of the sweep', async () => {
      await seedSweep(2)
      const { asked, provider } = host({ [SWEEP[1]]: 'ready' }, [SWEEP[0]])
      expect(await reconcileReadiness(provider)).toBe(1)
      expect(asked).toContain(SWEEP[0])
      expect(await readinessOf(SWEEP[0])).toBe('pending')
      expect(await readinessOf(SWEEP[1])).toBe('ready')
    })

    const alerts = async () => {
      const rows = await sql<{ error: string }[]>`
        select error from client_error_logs where error like '%readiness reconcile%'`
      return rows.map((row) => row.error)
    }

    // One row per run whatever the outage's size, because `logServerFailure` dedupes on the exact
    // string and a GUID in the message would give every video its own alert. The `[cleanup]` scope
    // is asserted because it is part of that dedupe key: renaming it splits the alert history in
    // two, which no assertion on the message alone would notice.
    it('alerts once for an outage, not once per video', async () => {
      await seedSweep(3)
      await sql`delete from client_error_logs where error like '%readiness reconcile%'`
      const { provider } = host({}, SWEEP.slice(0, 3))
      expect(await reconcileReadiness(provider)).toBe(0)
      expect(await alerts()).toEqual(['[cleanup] readiness reconcile: lookups failed, see the console for which'])
    })

    // The threshold, not just the message: at `>=` a clean run alerts every night, which is the
    // failure mode that trains everybody to ignore the alert.
    it('stays quiet when nothing failed', async () => {
      await seedSweep(1)
      await sql`delete from client_error_logs where error like '%readiness reconcile%'`
      const { provider } = host({ [SWEEP[0]]: 'ready' })
      expect(await reconcileReadiness(provider)).toBe(1)
      expect(await alerts()).toEqual([])
    })

    // The budget. Unbounded, the case this exists for (a webhook broken for a while) is exactly the
    // one that grows the set, so it would take the whole job down with it.
    it('stops at the limit rather than working the whole backlog in one run', async () => {
      await seedSweep(101)
      const { asked, provider } = host({})
      await reconcileReadiness(provider)
      // Both directions: two upper bounds let the limit shrink to 1 unnoticed. `seedSweep(101)`
      // guarantees at least 100 pending rows, so the exact count is safe to pin.
      expect(asked.length).toBe(100)
    })
  })

  // Also covered through the webhook route, but pinned here to stay inside this module's related
  // set, which is all the mutation runner exercises.
  describe('telling the uploader', () => {
    const attachFile = async (uploadedMinutesAgo: number) => {
      await sql`delete from notifications where source_type = 'video_ready' and file_fk = ${FILE_ID}`
      await sql`update bunny_streams set file_fk = null where id = ${GUID}`
      await sql`delete from files where id = ${FILE_ID}`
      await sql`
        insert into files (id, region_fk, created_by, path, created_at)
        values (${FILE_ID}, ${regionId}, ${uploaderId}, '',
                now() - (${uploadedMinutesAgo} || ' minutes')::interval)`
      await sql`update bunny_streams set file_fk = ${FILE_ID} where id = ${GUID}`
      await sql`update files set bunny_stream_fk = ${GUID} where id = ${FILE_ID}`
    }

    const notifications = async () => {
      const rows = await sql<{ count: string }[]>`
        select count(*) from notifications where source_type = 'video_ready' and file_fk = ${FILE_ID}`
      return Number(rows[0].count)
    }

    it('tells the uploader when the wait was long enough to be worth telling them about', async () => {
      await attachFile(30)
      expect(await promoteReadiness(GUID, 'ready')).toBe(true)
      expect(await notifications()).toBe(1)
    })

    // A minute, not zero: at zero the elapsed time is milliseconds, and a shrunken threshold still
    // passes.
    it('says nothing when the uploader is still watching it', async () => {
      await attachFile(1)
      expect(await promoteReadiness(GUID, 'ready')).toBe(true)
      expect(await notifications()).toBe(0)
    })

    // The other end of the window. A webhook answers in minutes, so a row this stale was corrected
    // by the sweep, long after the uploader either saw it play or stopped caring.
    it('says nothing when the news is a day stale', async () => {
      await attachFile(60 * 25)
      expect(await promoteReadiness(GUID, 'ready')).toBe(true)
      expect(await notifications()).toBe(0)
    })

    // Just inside it, so the bound is pinned from both sides rather than only from above.
    it('still tells them just inside the window', async () => {
      await attachFile(60 * 23)
      expect(await promoteReadiness(GUID, 'ready')).toBe(true)
      expect(await notifications()).toBe(1)
    })

    it('says nothing when the video failed', async () => {
      await attachFile(30)
      expect(await promoteReadiness(GUID, 'failed')).toBe(true)
      expect(await notifications()).toBe(0)
    })
  })
})
