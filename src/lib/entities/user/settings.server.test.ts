// @vitest-environment node
/**
 * The settings writer, against a real database.
 *
 * One claim, and it can only be checked here: the fallback that creates a missing row has to
 * accept the SQL EXPRESSIONS the watermark writes hand it. `greatest(coalesce(col, 0), N)` is a
 * self-reference Postgres rejects inside an `INSERT ... VALUES`, and an account with no settings
 * row is the only case that ever reaches that branch - so a mistake there is invisible until
 * somebody signs up, opens the feed, and their digest starts repeating itself every five minutes.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { users, userSettings } from '$lib/db/schema'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { eq, sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { writeUserSettings } from './settings.server'

let user = {} as SeedUser

/** The shape the callers use: a watermark that only ever moves forward, evaluated by the database
 *  rather than by whoever read the row a moment ago. */
const watermark = (activityId: number) => raw`greatest(coalesce(${userSettings.seenUpToActivityId}, 0), ${activityId})`

const settingsRow = async () => {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userFk, user.userId))
  return row
}

async function removeSettings() {
  // The link first: `users.user_settings_fk` points at the row about to go.
  await sql`update public.users set user_settings_fk = null where id = ${user.userId}`
  await sql`delete from public.user_settings where user_fk = ${user.userId}`
}

beforeAll(async () => {
  if (!reachable) return
  // Deliberately an account with NO settings row, which is what a sign-up that failed between its
  // two statements leaves behind.
  user = await createThrowawayUser('settings')
})

beforeEach(async () => {
  if (reachable) await removeSettings()
})

afterAll(async () => {
  if (reachable) {
    await removeSettings()
    await dropThrowawayUser(user)
  }
  await sql.end()
})

describe.skipIf(!reachable)('writeUserSettings', () => {
  it('creates the missing row, expression and all', async () => {
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { seenUpToActivityId: watermark(42) })

    const row = await settingsRow()
    expect(row.seenUpToActivityId).toBe(42)
  })

  /** The client reads settings through `users.user_settings_fk`, so a row nothing points at is a
   *  row nothing can see. */
  it('links the new row to its user', async () => {
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { seenUpToActivityId: watermark(42) })

    const row = await settingsRow()
    const [owner] = await db.select({ settingsFk: users.userSettingsFk }).from(users).where(eq(users.id, user.userId))

    expect(owner.settingsFk).toBe(row.id)
  })

  it('updates the row when it is already there', async () => {
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { seenUpToActivityId: watermark(42) })
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { seenUpToActivityId: watermark(99) })

    expect((await settingsRow()).seenUpToActivityId).toBe(99)
    // One row, not a second one beside it.
    expect(await db.select().from(userSettings).where(eq(userSettings.userFk, user.userId))).toHaveLength(1)
  })

  /** What `greatest` is there for: a scoped feed acknowledging an older id must not undo a newer
   *  acknowledgement. */
  it('leaves a watermark alone when the new value is behind it', async () => {
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { seenUpToActivityId: watermark(42) })
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { seenUpToActivityId: watermark(7) })

    expect((await settingsRow()).seenUpToActivityId).toBe(42)
  })

  it('writes a plain value too', async () => {
    await writeUserSettings(db, { authUserFk: user.authId, id: user.userId }, { contactLocale: 'de' })

    expect((await settingsRow()).contactLocale).toBe('de')
  })
})
