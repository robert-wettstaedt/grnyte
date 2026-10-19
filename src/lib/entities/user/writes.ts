import { resolve } from '$app/paths'
import type * as z from '$lib/forms/zod'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { updateUsernameSchema, userSettingsSchema } from './dto'

export const updateUsername = (values: z.input<typeof updateUsernameSchema>) =>
  write(mutators.users.updateUsername(values), { redirectTo: resolve('/(app)/settings') })

export const updateUserSettings = (values: z.input<typeof userSettingsSchema>) =>
  write(mutators.users.updateSettings(values))
