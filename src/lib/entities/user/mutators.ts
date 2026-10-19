import type { QueryContext } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineMutator } from '@rocicorp/zero'
import { updateUsernameSchema, userSettingsSchema } from './dto'

const waitForServer = async () => {}

export const usersMutatorDefs = {
  users: {
    updateSettings: defineMutator(userSettingsSchema, async ({ args, ctx, tx }) => {
      // shortcut: Zero's context is untyped until `DefaultTypes.context` is registered.
      const authUserId = (ctx as QueryContext | undefined)?.authUserId
      const settings =
        authUserId == null ? undefined : await tx.run(zql.userSettings.where('authUserFk', authUserId).one())
      if (settings != null) {
        await tx.mutate.userSettings.update({ ...args, id: settings.id })
      }
    }),
    updateUsername: defineMutator(updateUsernameSchema, waitForServer),
  },
}
