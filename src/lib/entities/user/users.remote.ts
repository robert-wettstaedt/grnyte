import { regionMembers, users } from '$lib/db/schema'
import { formError, usernameSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { locales } from '$lib/paraglide/runtime'
import { authedCommand, authedForm } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { createUpdateEvent } from '../event/event.server'
import { writeUserSettings } from './settings.server'

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
    // Written from EXPLICIT picks only (the settings language row), never from an auto-detected
    // browser language: one visit on a colleague's German laptop must not silently switch which
    // language we mail somebody in.
    contactLocale: z.optional(z.enum(locales)),
    gradingScale: z.optional(z.enum(['FB', 'V'])),
    // The six push switches. They govern push and nothing else: what lands in the inbox and what
    // lands in the feed is not affected by any of them.
    notifyAscents: z.optional(z.boolean()),
    notifyComments: z.optional(z.boolean()),
    notifyCommunity: z.optional(z.boolean()),
    notifyDirected: z.optional(z.boolean()),
    notifyGuidebookEdits: z.optional(z.boolean()),
    notifyReactions: z.optional(z.boolean()),
    unitSystem: z.optional(z.nullable(z.enum(['metric', 'imperial']))),
  }),
  async (values, { db, user }) => {
    await writeUserSettings(db, user, values)
  },
)
