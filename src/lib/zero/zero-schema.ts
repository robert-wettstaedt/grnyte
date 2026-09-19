import type { Schema as ZeroSchema } from '@rocicorp/zero'
import { schema as genSchema, type Schema as GenSchema } from './zero-schema.gen.ts'

type Schema = GenSchema

const schema = genSchema satisfies ZeroSchema & {
  enableLegacyMutators: false
  enableLegacyQueries: false
}

export { schema, type Schema }
