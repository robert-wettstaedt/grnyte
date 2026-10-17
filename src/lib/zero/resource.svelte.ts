import { isFieldDevice } from '$lib/state/device.svelte'
import { isOnline } from '$lib/state/online.svelte'
import { holdsPill, pillSurface, type PillSurface } from '$lib/state/pill.svelte'
import { lastSyncedAt, localStoreLoaded } from '$lib/state/sync.svelte'
import type { HumanReadable, QueryOrQueryRequest, ReadonlyJSONValue } from '@rocicorp/zero'
import { offlinePolicyOf, type OfflinePolicy } from './offline'
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

/** The one thing a resource needs from the Zero client, injectable so a test can build one. */
export interface QuerySource {
  createQuery(
    request: QueryRequest,
    enabled: boolean,
  ): {
    readonly data: unknown
    readonly details: { readonly type: 'complete' | 'error' | 'unknown' }
    readonly view?: { ensureSubscribed(): void }
  }
}

export type ResourceStatus = 'error' | 'loading' | 'ready'

// The registry's requests share no argument or row types, and only their names and hashes are read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryRequest = QueryOrQueryRequest<any, any, any, Schema, any, any>

// Read inside the resource's derived, so a client swapped on login re-targets the query.
const zeroSource: QuerySource = { createQuery: (request, enabled) => getZ().createQuery(request, enabled) }

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
    return this.#confirming.every((query) => query.details.type === 'complete')
  }

  get phase(): QueryPhase {
    return resolvePhase({
      excluded: this.#keptInput().policy === 'excluded',
      online: isOnline(),
      rawEmpty: this.#rawEmpty,
      settled: this.#settled,
      status: this.#status,
    })
  }

  #enabled: () => boolean

  #request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>

  #source: QuerySource

  // Recreated whenever the request getter's dependencies change (route params,
  // filters) or the Zero client is swapped on login/logout: `getZ()` is a
  // reactive read. The ViewStore inside zero-svelte dedupes identical queries
  // and defers cleanup, so this is cheap.
  #query = $derived.by(() => {
    const query = this.#source.createQuery(this.#request(), this.#enabled())

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

  #register: (() => QueryRequest[]) | undefined

  // What the server must confirm: the query itself, or in a composite the named queries it
  // registers, since its local read is never sent and so never completes.
  #confirming = $derived.by(() => {
    if (this.#register == null) {
      return [this.#query]
    }

    return this.#register().map((request) => {
      const query = this.#source.createQuery(request, this.#enabled())
      query.view?.ensureSubscribed()
      return query
    })
  })

  #select: (data: HumanReadable<TReturn>) => TOut

  #data = $derived.by(() => this.#select(this.#query.data as HumanReadable<TReturn>))

  #offline: (() => OfflinePolicy | undefined) | OfflinePolicy | undefined
  #policy = $derived.by(() => {
    const requests = this.#register?.() ?? [this.#request()]
    return resolvePolicy(requests.map((request) => offlinePolicyOf(queryNameOf(request))))
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
  #settledViews: unknown[] = []

  #keptInput = () => ({
    fieldDevice: isFieldDevice(),
    guidebookSynced: lastSyncedAt('guidebook') != null,
    personalSynced: lastSyncedAt('personal') != null,
    policy: (typeof this.#offline === 'function' ? this.#offline() : this.#offline) ?? this.#policy,
    referenceSynced: lastSyncedAt('reference') != null,
    storeLoaded: localStoreLoaded(),
  })

  #settled = $derived.by(() => {
    const views = this.#confirming.map((query) => query.view)
    const next = resolveSettled({
      // Offline, a kept query is answered by its preload; latched like a server answer, so the
      // reconnect does not drop a form to `arriving` and remount its fields over the edits.
      complete: this.isComplete || (!isOnline() && resolveKept(this.#keptInput())),
      latched: this.#settledLatch,
      sameView: sameViews(views, this.#settledViews),
    })
    this.#settledViews = views
    this.#settledLatch = next
    return next
  })

  #status: ResourceStatus = $derived.by(() => {
    return resolveStatus({
      complete: this.isComplete,
      errored: this.#confirming.some((query) => query.details.type === 'error'),
      rawEmpty: this.#rawEmpty,
    })
  })

  constructor(
    request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
    select: (data: HumanReadable<TReturn>) => TOut,
    enabled: () => boolean,
    offline: (() => OfflinePolicy | undefined) | OfflinePolicy | undefined,
    register: (() => QueryRequest[]) | undefined,
    source: QuerySource,
    surface: PillSurface | undefined,
  ) {
    this.#source = source
    this.#request = request
    this.#select = select
    this.#enabled = enabled
    this.#offline = offline
    this.#register = register

    // Resolved now, during component init, so it is the surface this resource renders on. Built
    // outside a component there is none, and it holds no pill rather than throwing.
    const pill = holdsPill() ? (surface ?? pillSurface()) : undefined
    if (pill != null) {
      try {
        $effect(() => {
          if (this.phase.kind === 'arriving') {
            return pill.hold(this)
          }
        })
      } catch {
        // effect_orphan: no component or effect root owns this resource.
      }
    }
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
 * @param opts.offline overrides the query's offline policy for this usage, for one that depends on
 *   its arguments (your own logbook is kept, somebody else's is not).
 * @param opts.source the Zero client; tests pass a fake.
 * @param opts.surface the pill to hold while arriving; tests pass one, components read context.
 * @param opts.register makes this a composite: a local-only `zql` read over rows these named queries
 *   sync, which supply its readiness and policy (`$lib/zero/coverage` checks the read stays inside).
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
  opts?: {
    enabled?: () => boolean
    offline?: (() => OfflinePolicy | undefined) | OfflinePolicy
    register?: () => QueryRequest[]
    source?: QuerySource
    surface?: PillSurface
  },
): QueryResource<TOut> {
  return new Resource(
    request,
    select,
    opts?.enabled ?? (() => true),
    opts?.offline,
    opts?.register,
    opts?.source ?? zeroSource,
    opts?.surface,
  )
}

/** More rows may still come, the first included: a held space is worth keeping. */
export function expectingMore(phase: QueryPhase): boolean {
  return phase.kind === 'loading' || phase.kind === 'arriving'
}

/**
 * Whether this device holds the whole answer without asking: the policy keeps it and the preload
 * that fills it finished. The reference stamp does not vouch for the guidebook, which lands later.
 */
export function resolveKept(input: {
  fieldDevice: boolean
  guidebookSynced: boolean
  personalSynced: boolean
  policy: OfflinePolicy | undefined
  referenceSynced: boolean
  storeLoaded: boolean
}): boolean {
  // Until the replica is read back, kept rows are empty because they are loading, or gone.
  if (!input.storeLoaded) {
    return false
  }
  if (input.policy === 'always') {
    return input.referenceSynced
  }
  if (!input.fieldDevice) {
    return false
  }

  return input.policy === 'field' ? input.guidebookSynced : input.policy === 'personal' && input.personalSynced
}

/**
 * What a screen may say, from the transport status and the settled latch. Order is load-bearing:
 * `settled` already folds in "offline and kept", and `loading` implies no rows, so an answer or an
 * excluded fragment needs no separate offline judgement.
 */
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

/** A composite's policy: one only when every query it registers agrees, since it is no more kept
 *  than its least kept query and the order of the policies says nothing about which that is. */
export function resolvePolicy(policies: (OfflinePolicy | undefined)[]): OfflinePolicy | undefined {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain function, nothing reads it reactively
  const distinct = new Set(policies)
  return distinct.size === 1 ? [...distinct][0] : undefined
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

/** Whether a composite still watches the same views, in order. Any change is a new request. */
export function sameViews(next: unknown[], previous: unknown[]): boolean {
  return next.length === previous.length && next.every((view, i) => view === previous[i])
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

/**
 * Resolve once the query has a row satisfying `isReady` in the local store, or
 * after `timeoutMs`. A server write (Drizzle) reaches Zero only after the sync
 * engine replicates it, so navigating to a newly restored entity races that lag
 * and flashes "not found". Awaiting this before navigation defers it until the
 * row is there. Entity modules wrap it as `waitForArea`/`waitForBlock`/etc.
 * ponytail: 5s cap is the ceiling, a slower sync only navigates to the loading state.
 */
export function waitForRow<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TReturn,
  TContext,
>(
  query: QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
  isReady: (data: HumanReadable<TReturn>) => boolean,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve) => {
    const view = getZ().materialize(query)
    const finish = () => {
      clearTimeout(timer)
      view.destroy()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    // The listener hands back a deep-readonly view; `isReady` only inspects it.
    view.addListener((data) => {
      if (isReady(data as HumanReadable<TReturn>)) finish()
    })
  })
}

// Zero carries the registry name on every request, so a resource finds its own offline policy.
function queryNameOf(request: QueryRequest): string | undefined {
  return typeof request === 'object' && 'query' in request ? request.query.queryName : undefined
}
