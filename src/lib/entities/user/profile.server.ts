import { resolve } from '$app/paths'
import { regionMembers, users } from '$lib/db/schema'
import { formError, type FormMessage } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { createUpdateEvent } from '../event/event.server'
import type { updateUsernameSchema, userSettingsSchema } from './dto'
import { writeUserSettings } from './settings.server'

export type Refuse = (message: FormMessage, field?: 'username') => never

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
export async function updateUsernameRow(
  { username }: z.output<typeof updateUsernameSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
  refuse: Refuse,
) {
  // Unchanged is still a successful submit, so it leaves for the same place a real rename does.
  if (username === user.username) {
    return { redirectTo: resolve('/(app)/settings') }
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
      refuse(formError('settings_usernameTaken'), 'username')
    }
  }

  await db.update(users).set({ username }).where(eq(users.id, user.id))

  // One event per region the user belongs to: a rename is only news to the people who see that
  // name in their lists, and the feed is region-scoped. The fold keys on the region too, so
  // renaming twice inside the window merges to one change per region rather than stacking, and
  // renaming back to where it started removes the event entirely.
  for (const regionFk of regionFks) {
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { username },
      object: { id: user.id, type: 'user' },
      oldEntity: { username: user.username },
      regionFk,
    })
  }

  return { redirectTo: resolve('/(app)/settings') }
}

/**
 * Update the signed-in user's preferences. Each field is optional so changing one never rewrites
 * the other. RLS scopes the write to their own `user_settings` row; if none exists yet (a
 * partial-signup gap) it is created and linked, so the write is never a silent no-op. `unitSystem`
 * null means "follow the locale".
 */
export async function updateUserSettingsRow(
  values: z.output<typeof userSettingsSchema>,
  { db, user }: Pick<Context, 'db' | 'user'>,
) {
  await writeUserSettings(db, user, values)
}
