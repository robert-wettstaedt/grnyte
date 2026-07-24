import { users, userSettings } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { eq } from 'drizzle-orm'
import z from 'zod'

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
