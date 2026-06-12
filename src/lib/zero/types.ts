import type { PullRow } from '@rocicorp/zero'
import type { Schema } from './zero-schema'

export type Row<TTable extends keyof Schema['tables']> = PullRow<TTable, Schema>

/**
 * The single-row output type of a registry query — exactly what a DTO mapper
 * receives. For `.one()` queries this strips the `| undefined`; for list
 * queries it is the array element. Derived from the query's own `.related(...)`
 * chain, so a mapper's input can never drift from the query that feeds it.
 */
export type QueryRow<Q extends { readonly '~': { readonly $return: unknown } }> = NonNullable<Q['~']['$return']>
