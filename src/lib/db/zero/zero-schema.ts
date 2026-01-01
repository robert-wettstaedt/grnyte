import type { Schema as ZeroSchema } from '@rocicorp/zero'
import { schema as genSchema, type Schema as GenSchema } from './zero-schema.gen'

type Schema = Omit<GenSchema, 'enableLegacyQueries' | 'enableLegacyMutators'>

const schema = {
  ...genSchema,
  enableLegacyQueries: false,
  enableLegacyMutators: false,
} as const satisfies ZeroSchema

export { schema, type Schema }
