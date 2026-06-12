import type { HumanReadable, QueryOrQueryRequest, ReadonlyJSONValue } from '@rocicorp/zero'
import { getZ } from './z.svelte'
import type { Schema } from './zero-schema'

export type ResourceStatus = 'loading' | 'ready' | 'error'

/**
 * What pages and components see: reactive, DTO-mapped query state.
 *
 * Status semantics follow Zero's result types (local-first):
 * - `loading`: nothing usable yet (result still `unknown` and empty)
 * - `ready`:   data to show — possibly local/optimistic; `isComplete` flips
 *              true once the server confirmed it (`isSyncing` is the inverse,
 *              for subtle "syncing…" indicators)
 * - `error`:   the server rejected or failed the query. Zero exposes no error
 *              details, only the state; see `getZ().connectionState` for
 *              diagnostics.
 */
export interface QueryResource<TOut> {
  readonly data: TOut
  readonly status: ResourceStatus
  /** `ready` but with nothing to render: `[]` for lists, `undefined` for `.one()`. */
  readonly isEmpty: boolean
  readonly isSyncing: boolean
  readonly isComplete: boolean
}

class Resource<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TReturn,
  TOut,
> implements QueryResource<TOut> {
  #request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>
  #select: (data: HumanReadable<TReturn>) => TOut
  #enabled: () => boolean

  // Recreated whenever the request getter's dependencies change (route params,
  // filters) or the Zero client is swapped on login/logout — `getZ()` is a
  // reactive read. The ViewStore inside zero-svelte dedupes identical queries
  // and defers cleanup, so this is cheap.
  #query = $derived.by(() => getZ().createQuery(this.#request(), this.#enabled()))

  #rawEmpty = $derived.by(() => {
    const raw = this.#query.data
    return raw === undefined || (Array.isArray(raw) && raw.length === 0)
  })

  #status: ResourceStatus = $derived.by(() => {
    const type = this.#query.details.type
    if (type === 'error') {
      return 'error'
    }

    // Stale-while-revalidate: local rows (e.g. from the initZero preloads)
    // render immediately even before the server confirms, so only an *empty*
    // unknown result counts as loading.
    if (type === 'unknown' && this.#rawEmpty) {
      return 'loading'
    }

    return 'ready'
  })

  #data = $derived.by(() => this.#select(this.#query.data))

  constructor(
    request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
    select: (data: HumanReadable<TReturn>) => TOut,
    enabled: () => boolean,
  ) {
    this.#request = request
    this.#select = select
    this.#enabled = enabled
  }

  get data(): TOut {
    return this.#data
  }

  get status(): ResourceStatus {
    return this.#status
  }

  get isEmpty(): boolean {
    return this.#status === 'ready' && this.#rawEmpty
  }

  get isSyncing(): boolean {
    return this.#query.details.type === 'unknown'
  }

  get isComplete(): boolean {
    return this.#query.details.type === 'complete'
  }
}

/**
 * Binds a query from the registry in `$lib/zero/queries.ts` to a DTO mapper as
 * a reactive resource. Entity modules wrap this in page-facing factories
 * (src/lib/entities/&lt;name&gt;/resources.svelte.ts); pages never call it directly.
 *
 * @param request reactive getter producing the query request — referenced
 *   state (route params, filters) re-targets the underlying query when it
 *   changes.
 * @param select maps the raw Zero rows to DTOs; runs memoized inside
 *   `$derived`, keeping Zero's reactivity.
 * @param opts.enabled gate for dependent queries that aren't ready to run yet.
 */
export function createResource<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TReturn,
  TOut,
>(
  request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
  select: (data: HumanReadable<TReturn>) => TOut,
  opts?: { enabled?: () => boolean },
): QueryResource<TOut> {
  return new Resource(request, select, opts?.enabled ?? (() => true))
}
