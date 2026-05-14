import type { Schema } from '$lib/db/zero/zero-schema'
import type {
  DefaultContext,
  HumanReadable,
  PullRow,
  Query,
  QueryOrQueryRequest,
  ReadonlyJSONValue,
} from '@rocicorp/zero'
import type { Snippet } from 'svelte'
import type { QueryResultDetails } from 'zero-svelte'

export interface ZeroQueryWrapperBaseProps {
  onLoad?: () => void
}

export interface ZeroQueryWrapperProps<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TReturn = PullRow<TTable, Schema>,
  TContext = DefaultContext,
> extends ZeroQueryWrapperBaseProps {
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
  query: QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>
  showEmpty?: boolean
}

export { default } from './KeyWrapper.svelte'

export type ZeroQueryResult<T> =
  T extends QueryOrQueryRequest<infer TTable, infer TInput, infer TOutput, Schema, infer TReturn, infer TContext>
    ? NonNullable<HumanReadable<TReturn>>
    : T extends Query<infer TTable, Schema, infer TReturn>
      ? NonNullable<HumanReadable<TReturn>>
      : never
