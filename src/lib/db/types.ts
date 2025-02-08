/**
 * https://github.com/drizzle-team/drizzle-orm/issues/695#issuecomment-1881454650
 */

import * as schema from '$lib/db/schema'
import type { BuildQueryResult, DBQueryConfig, ExtractTablesWithRelations } from 'drizzle-orm'

type Schema = typeof schema
type TSchema = ExtractTablesWithRelations<Schema>

export type IncludeRelation<TableName extends keyof TSchema> = DBQueryConfig<
  'one' | 'many',
  boolean,
  TSchema,
  TSchema[TableName]
>['with']

export type InferResultType<
  TableName extends keyof TSchema,
  With extends IncludeRelation<TableName> | undefined = undefined,
> = BuildQueryResult<
  TSchema,
  TSchema[TableName],
  {
    with: With
  }
>

export type NestedArea = InferResultType<'areas', { parent: true }>
export type NestedBlock = InferResultType<'blocks', { area: true; geolocation: true; routes: true }>
export type NestedRoute = InferResultType<'routes', { block: { with: { area: true } } }>
export type NestedAscent = InferResultType<'ascents', { author: true; route: true }>
export type NestedEntityToStorageObject = InferResultType<'entityToStorageObjects', { storageObject: true }>
