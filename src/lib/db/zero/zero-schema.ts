import { definePermissions, type Schema as ZeroSchema } from '@rocicorp/zero'
import { schema as genSchema, type Schema as GenSchema } from './zero-schema.gen'

type Schema = Omit<GenSchema, 'enableLegacyQueries' | 'enableLegacyMutators'>

const schema = {
  ...genSchema,
  enableLegacyQueries: false,
  enableLegacyMutators: false,
} as const satisfies ZeroSchema

// Synced-query auth lives in the get-queries endpoint; this empty ruleset only
// exists so the `zero.permissions` table is (re)created on deploy (e.g. after a wipe).
// ponytail: empty by design — don't add row rules here, auth is server-side.
export const permissions = definePermissions<{ sub: string }, Schema>(schema, () => ({}))

export { schema, type Schema }
