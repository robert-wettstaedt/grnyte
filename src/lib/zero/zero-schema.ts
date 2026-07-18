import type { Schema as ZeroSchema } from '@rocicorp/zero'
import { schema as genSchema, type Schema as GenSchema } from './zero-schema.gen'

type Schema = Omit<GenSchema, 'enableLegacyMutators' | 'enableLegacyQueries'>

const schema = {
  ...genSchema,
  enableLegacyMutators: false,
  enableLegacyQueries: false,
} as const satisfies ZeroSchema

export { schema, type Schema }
