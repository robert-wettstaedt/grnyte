import { powerSyncOnly } from '$lib/powersync/db.svelte'
import { isOnline } from '$lib/state/online.svelte'
import { holdsPill, pillSurface } from '$lib/state/pill.svelte'
import type { HumanReadable, QueryOrQueryRequest, ReadonlyJSONValue } from '@rocicorp/zero'
import { offlinePolicyOf } from './offline'
import { getZ } from './z.svelte'
import type { Schema } from './zero-schema'

/**
 * What a screen may say about a query, decided once. `answered` alone may state an absence;
 * `arriving` may summarise its rows (`summaryOf`); `partial` is offline rows never confirmed.
 */
export type QueryPhase =
  | { empty: boolean; kind: 'answered' }
  | { excluded: boolean; kind: 'unavailable' }
  | { kind: 'arriving' }
  | { kind: 'error' }
  | { kind: 'loading' }
  | { kind: 'partial' }

/** What pages and components see: the DTO-mapped rows, and the one answer about them. */
export interface QueryResource<TOut> {
  readonly data: TOut
  /** What a screen may say about this query: read this, never the transport's flags. */
  readonly phase: QueryPhase
}

export type ResourceStatus = 'error' | 'loading' | 'ready'

// The registry's requests share no argument or row types, and only their names and hashes are read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryRequest = QueryOrQueryRequest<any, any, any, Schema, any, any>

class Resource<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TReturn,
  TOut,
> implements QueryResource<TOut> {
  get data(): TOut {
    return this.#data
  }
  get isComplete(): boolean {
    return this.#query.details.type === 'complete'
  }

  get phase(): QueryPhase {
    return resolvePhase({
      excluded: this.#policy === 'excluded',
      online: zeroOnline(),
      rawEmpty: this.#rawEmpty,
      settled: this.#settled,
      status: this.#status,
    })
  }

  #enabled: () => boolean

  #request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>

  // Recreated whenever the request getter's dependencies change (route params,
  // filters) or the Zero client is swapped on login/logout: `getZ()` is a
  // reactive read. The ViewStore inside zero-svelte dedupes identical queries
  // and defers cleanup, so this is cheap.
  #query = $derived.by(() => {
    const query = getZ().createQuery(this.#request(), this.#enabled())

    // Subscribe from here rather than relying on zero-svelte to do it.
    //
    // `Query`'s constructor spins up a detached `$effect.root` whose only job is to read
    // `view.current` and so activate the view's subscriber; `.data` and `.details` then read the
    // wrapper's state *without* subscribing, on the assumption that root already did. When it does
    // not run, nothing ever materializes the view: the wrapper keeps its constructed defaults
    // (`undefined`/`[]`, `type: 'unknown'`) for the life of the page, which this layer reports as
    // `loading` and the app renders as a spinner that never resolves. On a direct load of an entity
    // page that was reliably `currentUser`, and `isLoading` in the global state turns one stuck
    // query into a blank app, the "stuck loading" that looked like a Zero sync failure and was not:
    // `z.run()` and `z.materialize()` answer the same query from the same replica in milliseconds.
    //
    // `ensureSubscribed()` is the wrapper's own escape hatch for exactly this. Calling it inside a
    // `$derived` ties the subscription to this resource's lifetime instead of to a root nothing owns.
    query.view?.ensureSubscribed()

    return query
  })

  #select: (data: HumanReadable<TReturn>) => TOut

  #data = $derived.by(() => this.#select(this.#query.data as HumanReadable<TReturn>))

  #policy = $derived.by(() => {
    return offlinePolicyOf(queryNameOf(this.#request()))
  })
  #rawEmpty = $derived.by(() => {
    const raw = this.#query.data
    return raw === undefined || (Array.isArray(raw) && raw.length === 0)
  })

  #settledLatch = false

  // Latched here rather than in each form, and keyed on the VIEW, not the `Query`: `createQuery`
  // returns a new `Query` on every re-run of the derived above, while `ViewStore` hash-keys the
  // view on the request, so two `Query` wrappers for one request share a view that may already be
  // complete. Derived, never an effect: a trailing reset would leave `settled` true for one flush
  // over the next request's rows.
  #settledView: unknown

  #settled = $derived.by(() => {
    const view = this.#query.view
    const next = resolveSettled({
      complete: this.isComplete,
      latched: this.#settledLatch,
      sameView: view === this.#settledView,
    })
    this.#settledView = view
    this.#settledLatch = next
    return next
  })

  #status: ResourceStatus = $derived.by(() => {
    return resolveStatus({
      complete: this.isComplete,
      errored: this.#query.details.type === 'error',
      rawEmpty: this.#rawEmpty,
    })
  })

  constructor(
    request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
    select: (data: HumanReadable<TReturn>) => TOut,
    enabled: () => boolean,
  ) {
    this.#request = request
    this.#select = select
    this.#enabled = enabled
    holdWhileArriving(this)
  }
}

/**
 * Binds a query from the registry in `$lib/zero/queries.ts` to a DTO mapper as
 * a reactive resource. Entity modules wrap this in page-facing factories
 * (src/lib/entities/&lt;name&gt;/resources.svelte.ts); pages never call it directly.
 *
 * @param request reactive getter producing the query request: referenced
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

/** More rows may still come, the first included: a held space is worth keeping. */
export function expectingMore(phase: QueryPhase): boolean {
  return phase.kind === 'loading' || phase.kind === 'arriving'
}

/**
 * Holds the nearest pill while `resource` arrives. Call during component init, so it is the surface the
 * resource renders on; built outside a component, or `quietly`, it holds none rather than throwing.
 */
export function holdWhileArriving(resource: QueryResource<unknown>, surface = pillSurface()): void {
  if (!holdsPill() || surface == null) return
  try {
    $effect(() => {
      if (resource.phase.kind === 'arriving') return surface.hold(resource)
    })
  } catch {
    // effect_orphan: no component or effect root owns this resource.
  }
}

/** What a screen may say. Order is load-bearing: `settled` already folds in "offline from disk", and
 *  `loading` implies no rows, so neither needs its own offline check. */
export function resolvePhase({
  excluded,
  online,
  rawEmpty,
  settled,
  status,
}: {
  excluded: boolean
  online: boolean
  rawEmpty: boolean
  settled: boolean
  status: ResourceStatus
}): QueryPhase {
  if (status === 'error') return { kind: 'error' }
  if (settled) return { empty: rawEmpty, kind: 'answered' }
  if (!online && (excluded || status === 'loading')) return { excluded, kind: 'unavailable' }
  if (status === 'loading') return { kind: 'loading' }
  return online ? { kind: 'arriving' } : { kind: 'partial' }
}

/**
 * The settled latch, as a function of its inputs and nothing else, so a truth table can assert it.
 *
 * A new view means a different request, so the answer starts over from what that view already
 * knows. Otherwise the latch only ever goes up, which is the whole point: `complete` drops when a
 * backgrounded tab loses its socket, and a form must not tear down mid-edit.
 */
export function resolveSettled({
  complete,
  latched,
  sameView,
}: {
  complete: boolean
  latched: boolean
  sameView: boolean
}): boolean {
  return sameView ? latched || complete : complete
}

/**
 * What Zero's result says, mapped. Stale-while-revalidate: local rows (e.g. from the initZero
 * preloads) render before the server confirms, so only an EMPTY unconfirmed result is loading.
 */
export function resolveStatus({
  complete,
  errored,
  rawEmpty,
}: {
  complete: boolean
  errored: boolean
  rawEmpty: boolean
}): ResourceStatus {
  if (errored) return 'error'
  return !complete && rawEmpty ? 'loading' : 'ready'
}

/** A summary of a collection (a count, tallies, a sibling list) once it may show: answered, or
 *  arriving and not zero, since a zero claims absence. Offline fragments never summarise. */
export function summaryOf<T extends number | { readonly length: number } | { readonly size: number }>(
  phase: QueryPhase,
  value: T,
): T | undefined {
  if (phase.kind === 'answered') {
    return value
  }
  const counted: number | { readonly length: number } | { readonly size: number } = value
  const size = typeof counted === 'number' ? counted : 'size' in counted ? counted.size : counted.length
  return phase.kind === 'arriving' && size > 0 ? value : undefined
}

// Zero carries the registry name on every request, so a resource finds its own offline policy.
function queryNameOf(request: QueryRequest): string | undefined {
  return typeof request === 'object' && 'query' in request ? request.query.queryName : undefined
}

/** Whether Zero can reach its server: never in the measurement build, where it runs local-only and empty. */
function zeroOnline(): boolean {
  return isOnline() && !powerSyncOnly()
}
