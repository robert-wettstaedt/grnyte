// @vitest-environment node
/**
 * Selection and stamping for the admin error alert. The send itself is `alertAppAdmins`, which has
 * its own path; what is worth pinning here is which rows the cron picks up and what it leaves.
 */
import { db } from '$lib/db/db.server'
import { clientErrorLogs } from '$lib/db/schema'
import { reachable, sql } from '$lib/db/testDb'
import { and, eq, inArray, isNotNull, isNull, like, not } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const alertAppAdmins = vi.fn().mockResolvedValue(undefined)
vi.mock('./adminAlert.server', () => ({ alertAppAdmins }))

const { alertOnNewErrors } = await import('./errorAlert.server')

/** Unique per run, so a parallel suite's rows are never read or stamped by this one. */
const scope = `alerttest-${crypto.randomUUID()}`

const seed = (reason: string) => db.insert(clientErrorLogs).values({ error: `[${scope}] ${reason}`, source: 'server' })

const mine = () =>
  db
    .select()
    .from(clientErrorLogs)
    .where(like(clientErrorLogs.error, `[${scope}]%`))

/** What the run passed to the alert, so a test can read the count without the send happening. */
const alerted = () => alertAppAdmins.mock.calls.length

/**
 * Rows this suite parked, and the reason the suite needs to.
 *
 * `alertOnNewErrors` selects every unalerted row in the table, which is right in production and
 * makes a count assertion here depend on whatever else the database happens to hold. So each test
 * stamps the strangers first and {@link afterAll} puts them back.
 *
 * Only a clean finish restores them. If a run is killed in between, real rows in the shared dev
 * database stay stamped and never alert again, so recover with:
 *   update client_error_logs set alerted_at = null where alerted_at > now() - interval '1 hour';
 */
const parked: number[] = []

const parkStrangers = async () => {
  const strangers = await db
    .select({ id: clientErrorLogs.id })
    .from(clientErrorLogs)
    .where(and(isNull(clientErrorLogs.alertedAt), not(like(clientErrorLogs.error, `[${scope}]%`))))

  if (strangers.length === 0) return

  const ids = strangers.map((row) => row.id)
  parked.push(...ids)
  await db.update(clientErrorLogs).set({ alertedAt: new Date() }).where(inArray(clientErrorLogs.id, ids))
}

beforeEach(async () => {
  if (!reachable) return
  vi.clearAllMocks()
  await db.delete(clientErrorLogs).where(like(clientErrorLogs.error, `[${scope}]%`))
  await parkStrangers()
})

afterAll(async () => {
  if (reachable) {
    await db.delete(clientErrorLogs).where(like(clientErrorLogs.error, `[${scope}]%`))
    if (parked.length > 0) {
      await db.update(clientErrorLogs).set({ alertedAt: null }).where(inArray(clientErrorLogs.id, parked))
    }
  }
  await sql.end()
})

describe.skipIf(!reachable)('alertOnNewErrors', () => {
  it('alerts once for the run and stamps every row it named', async () => {
    await seed('first thing broke')
    await seed('second thing broke')

    const count = await alertOnNewErrors('https://example.test')

    expect(count).toBe(2)
    expect(alerted()).toBe(1)
    const rows = await mine()
    expect(rows.every((row) => row.alertedAt != null)).toBe(true)
  })

  // Without this the cron would restate the same faults every five minutes forever.
  it('says nothing on a second run over the same rows', async () => {
    await seed('first thing broke')
    await alertOnNewErrors('https://example.test')
    vi.clearAllMocks()

    const count = await alertOnNewErrors('https://example.test')

    expect(count).toBe(0)
    expect(alerted()).toBe(0)
  })

  // `alertAppAdmins` records its own failures through `logServerFailure`, so without this exclusion
  // a failing alerter writes a row that makes it alert again.
  it('never alerts about the alerter', async () => {
    await db.insert(clientErrorLogs).values({ error: '[adminAlert] errorLogs failed: boom', source: 'server' })

    const count = await alertOnNewErrors('https://example.test')

    expect(count).toBe(0)
    expect(alerted()).toBe(0)

    await db.delete(clientErrorLogs).where(like(clientErrorLogs.error, '[adminAlert]%'))
  })

  // A failed alert mail lands under `[email]`, not `[adminAlert]`, so without excluding it too the
  // alert feeds itself. A mail failure for anything else must still alert.
  it('never alerts about its own mail, but does about other mail', async () => {
    await db.insert(clientErrorLogs).values([
      { error: '[email] send failed (x) for admin-alert-errorLogs', source: 'server' },
      { error: '[email] send failed (x) for invite', source: 'server' },
    ])

    expect(await alertOnNewErrors('https://example.test')).toBe(1)

    await db.delete(clientErrorLogs).where(like(clientErrorLogs.error, '[email]%'))
  })

  // One message, many rows: the alert counts faults, not occurrences.
  it('counts distinct messages rather than rows', async () => {
    await seed('the same thing broke')
    await seed('the same thing broke')
    await seed('a different thing broke')

    expect(await alertOnNewErrors('https://example.test')).toBe(2)

    const stamped = await db
      .select()
      .from(clientErrorLogs)
      .where(and(like(clientErrorLogs.error, `[${scope}]%`), isNotNull(clientErrorLogs.alertedAt)))
    expect(stamped).toHaveLength(3)
  })

  // The batch bounds a run, and the stamp must bound itself the same way. Stamping every unseen
  // row instead would mark the overflow as told about without ever naming it.
  it('leaves the overflow of an oversized backlog unstamped', async () => {
    const OVERFLOW = 501
    await db.insert(clientErrorLogs).values(
      Array.from({ length: OVERFLOW }, (_, index) => ({
        error: `[${scope}] fault number ${index}`,
        source: 'server' as const,
      })),
    )

    const count = await alertOnNewErrors('https://example.test')

    expect(count).toBe(500)
    const leftover = (await mine()).filter((row) => row.alertedAt == null)
    expect(leftover).toHaveLength(OVERFLOW - 500)
  })

  // The stamp has to happen even when nobody was reachable, or a broken mail host turns into a
  // five-minute loop over the same rows.
  it('stamps even when the send fails', async () => {
    alertAppAdmins.mockRejectedValueOnce(new Error('no admins reachable'))
    await seed('first thing broke')

    await alertOnNewErrors('https://example.test')

    const rows = await mine()
    expect(rows.every((row) => row.alertedAt != null)).toBe(true)
  })

  it('leaves a client row alone once it is stamped', async () => {
    const [row] = await db
      .insert(clientErrorLogs)
      .values({ error: `[${scope}] a client fault`, source: 'client' })
      .returning()

    expect(await alertOnNewErrors('https://example.test')).toBe(1)

    const [after] = await db.select().from(clientErrorLogs).where(eq(clientErrorLogs.id, row.id))
    expect(after.alertedAt).not.toBeNull()
  })
})
