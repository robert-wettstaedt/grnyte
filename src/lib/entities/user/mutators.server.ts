import { asCaller, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
import { updateUsernameSchema, userSettingsSchema } from './dto'
import { updateUsernameRow, updateUserSettingsRow } from './profile.server'

export const usersServerMutatorDefs = {
  users: {
    updateSettings: defineServerMutator(userSettingsSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateUserSettingsRow(args, { ...ctx, db }))
    }),
    updateUsername: defineServerMutator(updateUsernameSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateUsernameRow(args, { ...ctx, db }, refuseWithField))
    }),
  },
}
