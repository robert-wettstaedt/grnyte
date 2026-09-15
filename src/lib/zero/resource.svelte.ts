import { isFieldDevice } from '$lib/state/device.svelte'
import { isOnline } from '$lib/state/online.svelte'
import { lastSyncedAt } from '$lib/state/sync.svelte'
import type { HumanReadable, QueryOrQueryRequest, ReadonlyJSONValue } from '@rocicorp/zero'
import { offlinePolicyOf, type OfflinePolicy } from './offline'
import { getZ } from './z.svelte'
import type { Schema } from './zero-schema'

/**
 * Why there is nothing to show yet, answered once here instead of at every call site.
 *
 * - `ready`: there is an answer. Possibly an empty one, which is still an answer.
 * - `loading`: genuinely on its way. Only ever reported while online.
 * - `excluded`: offline, and this is data we deliberately do not keep (see `OFFLINE_QUERIES`).
 *   It is not coming until the connection does, and whatever rows are locally present are a
 *   fragment left by some other query's preload rather than the answer.
 * - `unsynced`: offline, and this is not on the device. It may exist; we cannot say.
 * - `error`: the server rejected or failed it. A fact rather than an absence, but it belongs in the
 *   same union so that a caller asking "may I state this number" gets one answer and not four.
 *
 * The last two used to be four separate judgements in four modules, each reading different
 * evidence, and three of them were wrong: one called a completed-and-genuinely-empty result "not
 * downloaded", one used row count as a proxy for completeness on a query its own preload seeded,
 * and two keyed on `isComplete`/`isSyncing`, which are facts about the transport and reset
 * themselves when a backgrounded tab loses its socket. The resource is the only layer holding all
 * the evidence, so the judgement belongs here.
 */
export type Availability = 'error' | 'excluded' | 'loading' | 'ready' | 'unsynced'

/**
 * What pages and components see: reactive, DTO-mapped query state.
 *
 * Status semantics follow Zero's result types (local-first):
 * - `loading`: nothing usable yet (result still `unknown` and empty)
 * - `ready`:   data to show: possibly local/optimistic; `isComplete` flips
 *              true once the server confirmed it (`isSyncing` is the inverse,
 *              for subtle "syncing…" indicators)
 * - `error`:   the server rejected or failed the query. Zero exposes no error
 *              details, only the state; see `getZ().connectionState` for
 *              diagnostics.
 */
export interface QueryResource<TOut> {
  readonly availability: Availability
  readonly data: TOut
  readonly isComplete: boolean
  /** `ready` but with nothing to render: `[]` for lists, `undefined` for `.one()`. */
  readonly isEmpty: boolean
  readonly isSyncing: boolean
  readonly status: ResourceStatus
}

export type ResourceStatus = 'error' | 'loading' | 'ready'

class Resource<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TReturn,
  TOut,
> implements QueryResource<TOut> {
  get availability(): Availability {
    return resolveAvailability({
      fieldDevice: isFieldDevice(),
      guidebookSynced: lastSyncedAt('guidebook') != null,
      online: isOnline(),
      policy: this.#offline ?? offlinePolicyOf(this.#queryName),
      referenceSynced: lastSyncedAt('reference') != null,
      status: this.#status,
    })
  }

  get data(): TOut {
    return this.#data
  }
  get isComplete(): boolean {
    return this.#query.details.type === 'complete'
  }
  get isEmpty(): boolean {
    return this.#status === 'ready' && this.#rawEmpty
  }

  get isSyncing(): boolean {
    return this.#query.details.type === 'unknown'
  }

  get status(): ResourceStatus {
    return this.#status
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

  #data = $derived.by(() => this.#select(this.#query.data))

  #offline: OfflinePolicy | undefined

  // Zero carries the registry name on every request (`QueryRequest.query.queryName`), so a resource
  // can look up its own offline policy without a single call site having to pass anything.
  #queryName = $derived.by(() => {
    const request = this.#request()
    return typeof request === 'object' && 'query' in request ? request.query.queryName : undefined
  })

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

  constructor(
    request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
    select: (data: HumanReadable<TReturn>) => TOut,
    enabled: () => boolean,
    offline: OfflinePolicy | undefined,
  ) {
    this.#request = request
    this.#select = select
    this.#enabled = enabled
    this.#offline = offline
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
 * @param opts.offline overrides the query's entry in `OFFLINE_QUERIES` for this one usage. Only for
 *   a query whose policy genuinely depends on its arguments: somebody else's logbook is not kept
 *   offline while your own is, from the same query.
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
  opts?: { enabled?: () => boolean; offline?: OfflinePolicy },
): QueryResource<TOut> {
  return new Resource(request, select, opts?.enabled ?? (() => true), opts?.offline)
}

/**
 * The offline judgement, as a function of its inputs and nothing else.
 *
 * Six inputs, five outputs, and an order between the branches that is load-bearing twice. It lived
 * inside a class getter reading three module singletons, so it could not be constructed and could
 * not be asserted, and every bug found in it was a case a truth table would have caught first:
 * `ready` on a fragment, `always`/`field` sitting dead, `error` folded into `ready`, and a `field`
 * gate leaning on a stamp that was about the reference data rather than the guidebook.
 *
 * Same shape as `connectionVerdict` and `shouldKeepOffline`, for the same reason.
 *
 * @param input.status what Zero's result type says, mapped by the resource.
 * @param input.policy this query's entry in `OFFLINE_QUERIES`, or a per-usage override.
 * @param input.online the app's own reachability answer, not `navigator.onLine`.
 * @param input.referenceSynced this device finished the always-preload at least once.
 * @param input.guidebookSynced this device finished the field preload at least once. NOT the same
 *   claim: the reference stamp lands seconds into a sync with thousands of rows still to come.
 * @param input.fieldDevice this device keeps the guidebook at all.
 */
export function resolveAvailability(input: {
  fieldDevice: boolean
  guidebookSynced: boolean
  online: boolean
  policy: OfflinePolicy | undefined
  referenceSynced: boolean
  status: ResourceStatus
}): Availability {
  if (input.status === 'error') {
    return 'error'
  }

  // Tested before the rows are, and this order is the whole point. Zero answers a query from the
  // local replica, and an excluded query's table is seeded by *other* preloads: a stranger's ascents
  // arrive with the routes you browsed. So offline these hold a fragment, and a fragment is
  // indistinguishable from an answer by row count alone. Reporting `ready` because something was
  // there let a profile draw a tally, a hardest grade and a whole histogram out of whichever few
  // rows happened to be local, and present them as that person's climbing.
  if (!input.online && input.policy === 'excluded') {
    return 'excluded'
  }

  if (input.status !== 'loading') {
    return 'ready'
  }

  // Online, "nothing yet" means exactly that.
  if (input.online) {
    return 'loading'
  }

  // Offline and empty. Empty is an *answer* here rather than a gap, but only on a device that
  // finished the preload which would have filled it. Without this an area that genuinely
  // has no routes told a reader with a fully synced guidebook to reconnect and download it: the same
  // wrong claim as the fragment above, with the sign flipped.
  if (input.policy === 'always' && input.referenceSynced) {
    return 'ready'
  }

  if (input.policy === 'field' && input.guidebookSynced && input.fieldDevice) {
    return 'ready'
  }

  return 'unsynced'
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
