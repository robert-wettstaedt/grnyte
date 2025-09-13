import type { HumanReadable, Query as QueryDef, Schema } from '@rocicorp/zero'
import type { Snippet } from 'svelte'
import type { QueryResultDetails } from 'zero-svelte'

export interface ZeroQueryWrapperBaseProps {
  onLoad?: () => void
}

export interface ZeroQueryWrapperProps<TSchema extends Schema, TTable extends keyof TSchema['tables'] & string, TReturn>
  extends ZeroQueryWrapperBaseProps {
  after?: Snippet<[HumanReadable<TReturn>, QueryResultDetails]>
  children?: Snippet<[HumanReadable<TReturn>, QueryResultDetails]>
  loadingIndicator?: { type: 'skeleton'; count?: number } | { type: 'spinner'; size?: string }
  query: QueryDef<TSchema, TTable, TReturn>
  showEmpty?: boolean
}

export { default } from './KeyWrapper.svelte'

export type ZeroQueryResult<
  T extends QueryDef<TSchema, TTable, TReturn> | null,
  TSchema extends Schema = Schema,
  TTable extends keyof TSchema['tables'] & string = keyof TSchema['tables'] & string,
  TReturn = any,
> = NonNullable<Awaited<ReturnType<NonNullable<T>['run']>>>
