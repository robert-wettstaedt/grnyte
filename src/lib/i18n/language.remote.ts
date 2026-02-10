import { command } from '$app/server'
import * as schema from '$lib/db/schema'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { and, eq } from 'drizzle-orm'
import z from 'zod'

const updateLanguageSchema = z.object({
  language: z.string(),
  pushSubscriptionId: z.number(),
})
type UpdateLanguageSchema = z.infer<typeof updateLanguageSchema>

export const updateLanguage = command(updateLanguageSchema, (arg) => enhance(arg, updateLanguageAction))

const updateLanguageAction: Action<UpdateLanguageSchema> = async (arg, db, user) => {
  await db
    .update(schema.pushSubscriptions)
    .set({ lang: arg.language })
    .where(
      and(
        eq(schema.pushSubscriptions.authUserFk, user.authUserFk),
        eq(schema.pushSubscriptions.id, arg.pushSubscriptionId),
      ),
    )
}
