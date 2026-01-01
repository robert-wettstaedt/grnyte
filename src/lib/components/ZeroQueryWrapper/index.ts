import type { Schema } from '$lib/db/zero/zero-schema'
import type { HumanReadable, Query as QueryDef } from '@rocicorp/zero'
import type { Snippet } from 'svelte'
import type { QueryResultDetails } from 'zero-svelte'

export interface ZeroQueryWrapperBaseProps {
  onLoad?: () => void
}

export interface ZeroQueryWrapperProps<TTable extends keyof Schema['tables'] & string, TReturn>
  extends ZeroQueryWrapperBaseProps {
  after?: Snippet<[HumanReadable<TReturn>, QueryResultDetails]>
  children?: Snippet<[HumanReadable<TReturn>, QueryResultDetails]>
  loadingIndicator?:
    | {
        count?: number
        height?: string
        type: 'skeleton'
      }
    | {
        type: 'spinner'
      }
  query: QueryDef<Schema, TTable, TReturn>
  showEmpty?: boolean
}

export { default } from './KeyWrapper.svelte'

export type ZeroQueryResult<
  T extends QueryDef<Schema, TTable, TReturn> | null,
  TTable extends keyof Schema['tables'] & string = keyof Schema['tables'] & string,
  TReturn = any,
> = NonNullable<Awaited<ReturnType<NonNullable<T>['run']>>>
