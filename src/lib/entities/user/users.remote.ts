import type { InsertActivity } from '$lib/db/schema'
import { regionMembers, users, userSettings } from '$lib/db/schema'
import { formError, usernameSchema } from '$lib/forms/schemas'
import { authedCommand, authedForm } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import z from 'zod'
import { insertActivity } from '../activity/activity.server'

/**
 * Rename the signed-in user. RLS scopes the write to their own row (`auth.uid() = auth_user_fk`),
 * and Zero replicates the new name to every client that can see them.
 *
 * The collision check is deliberately scoped to the caller's regions rather than the whole table:
 * usernames are display-only (profiles are keyed by id, mentions store `!users:id!`), the only place
 * two identical names are confusable is a shared region, and a global check would both deny a name
 * over an invisible collision and leak that the name exists in a private region. Consequence we
 * accept: a collision can appear later when someone joins a region that already uses the name. That
 * is a display ambiguity, and search already labels users with the regions they share with you.
 */
export const updateUsername = authedForm(
  z.object({ username: usernameSchema }),
  async ({ username }, { db, user, userRegions }, issue) => {
    if (username === user.username) {
      return
    }

    const regionFks = userRegions.map((region) => region.regionFk)

    if (regionFks.length > 0) {
      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(regionMembers, eq(regionMembers.userFk, users.id))
        .where(
          and(
            ne(users.id, user.id),
            sql`lower(${users.username}) = lower(${username})`,
            inArray(regionMembers.regionFk, regionFks),
            eq(regionMembers.isActive, true),
          ),
        )
        .limit(1)

      if (conflict != null) {
        invalid(issue.username(formError('settings_usernameTaken')))
      }
    }

    await db.update(users).set({ username }).where(eq(users.id, user.id))

    // One activity per region the user belongs to: a rename is only news to the people who see
    // that name in their lists, and the feed is region-scoped. `insertActivity` debounces on the
    // whole row until it has been notified, so repeating the same rename replaces the pending
    // entry rather than adding a second one.
    await insertActivity(
      db,
      regionFks.map(
        (regionFk): InsertActivity => ({
          columnName: 'username',
          entityId: String(user.id),
          entityType: 'user',
          newValue: username,
          oldValue: user.username,
          regionFk,
          type: 'updated',
          userFk: user.id,
        }),
      ),
    )
  },
)

/**
 * Update the signed-in user's preferences. Each field is optional so changing one never rewrites
 * the other. RLS scopes the write to their own `user_settings` row; if none exists yet (a
 * partial-signup gap) it is created and linked, so the write is never a silent no-op. `unitSystem`
 * null means "follow the locale".
 */
export const updateUserSettings = authedCommand(
  z.object({
    gradingScale: z.enum(['FB', 'V']).optional(),
    unitSystem: z.enum(['metric', 'imperial']).nullable().optional(),
  }),
  async (values, { db, user }) => {
    const [updated] = await db
      .update(userSettings)
      .set(values)
      .where(eq(userSettings.userFk, user.id))
      .returning({ id: userSettings.id })

    if (updated == null) {
      // No settings row yet: create one and link it from the user (the client reads settings via
      // users.userSettingsFk). ponytail: user_fk has no unique constraint to upsert against and a
      // per-user row has no real write contention, so update-then-insert without a lock is fine.
      const [created] = await db
        .insert(userSettings)
        .values({ ...values, authUserFk: user.authUserFk, userFk: user.id })
        .returning({ id: userSettings.id })
      await db.update(users).set({ userSettingsFk: created.id }).where(eq(users.id, user.id))
    }
  },
)
