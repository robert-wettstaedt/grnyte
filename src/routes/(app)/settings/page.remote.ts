import { command } from '$app/server'
import { userSettings } from '$lib/db/schema'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { eq } from 'drizzle-orm'
import z from 'zod'

const updateNotificationSettingsSchema = z.object({
  notifyModerations: z.boolean().nullable().optional(),
  notifyNewAscents: z.boolean().nullable().optional(),
  notifyNewUsers: z.boolean().nullable().optional(),
})
type UpdateNotificationSettingsValues = z.infer<typeof updateNotificationSettingsSchema>

export const updateNotificationSettings = command(updateNotificationSettingsSchema, (arg) =>
  enhance(arg, updateNotificationSettingsAction),
)

const updateNotificationSettingsAction: Action<UpdateNotificationSettingsValues> = async (values, db, user) => {
  const [result] = await db
    .update(userSettings)
    .set({
      notifyModerations: values.notifyModerations ?? false,
      notifyNewAscents: values.notifyNewAscents ?? false,
      notifyNewUsers: values.notifyNewUsers ?? false,
    })
    .where(eq(userSettings.authUserFk, user.authUserFk))
    .returning({
      notifyModerations: userSettings.notifyModerations,
      notifyNewAscents: userSettings.notifyNewAscents,
      notifyNewUsers: userSettings.notifyNewUsers,
    })

  return result
}
