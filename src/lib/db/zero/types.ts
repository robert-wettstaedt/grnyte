import type { PullRow, Schema as ZeroSchema } from '@rocicorp/zero'
import type { Schema } from './zero-schema'

type AvailableRelationships<
  TTable extends string,
  TSchema extends ZeroSchema,
> = keyof TSchema['relationships'][TTable] & string

type DestTableName<TTable extends string, TSchema extends ZeroSchema, TRelationship extends string> = LastInTuple<
  TSchema['relationships'][TTable][TRelationship]
>['destSchema']

type Relationship = readonly [Connection] | readonly [Connection, Connection]

type Connection = {
  readonly sourceField: readonly string[]
  readonly destField: readonly string[]
  readonly destSchema: string
  readonly cardinality: Cardinality
}
type Cardinality = 'one' | 'many'

type LastInTuple<T extends Relationship> = T extends readonly [infer L]
  ? L
  : T extends readonly [unknown, infer L]
    ? L
    : T extends readonly [unknown, unknown, infer L]
      ? L
      : never

// Recursive type to merge all relations into the base row
export type RowWithRelations<
  TTable extends keyof Schema['tables'],
  TWith extends Partial<Record<AvailableRelationships<TTable, TSchema>, true>>,
  TSchema extends ZeroSchema = Schema,
> = PullRow<TTable, TSchema> & {
  [K in keyof TWith &
    AvailableRelationships<TTable, TSchema>]: TSchema['relationships'][TTable][K][0]['cardinality'] extends 'many'
    ? Array<PullRow<DestTableName<TTable, TSchema, K & string>, TSchema>>
    : PullRow<DestTableName<TTable, TSchema, K & string>, TSchema> | undefined
}

export type Row<TTable extends keyof Schema['tables']> = PullRow<TTable, Schema>
