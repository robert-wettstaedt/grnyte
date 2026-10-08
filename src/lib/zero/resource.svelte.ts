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
  /**
   * Confirmed to have nothing: `[]` for lists, `undefined` for `.one()`. Never true while rows may
   * still arrive, so an absence claim can read it without checking anything else.
   */
  readonly isEmpty: boolean
  readonly isSyncing: boolean
  /**
   * Whether the related rows were ever whole for the request now in flight. A form seeded before
   * that stamps a proof of lists it never read, and the seed key never changes to re-stamp it.
   * Unlike `isComplete` this does not drop when a backgrounded tab loses its socket. Offline it is
   * also true of data the offline policy keeps and this device finished syncing, so a total or an
   * absence can be stated at the crag.
   */
  readonly settled: boolean
  readonly status: ResourceStatus
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
  get availability(): Availability {
    return resolveAvailability({ ...this.#keptInput(), online: isOnline(), status: this.#status })
  }

  get data(): TOut {
    return this.#data
  }
  get isComplete(): boolean {
    return this.#confirming.every((query) => query.details.type === 'complete')
  }
  get isEmpty(): boolean {
    return resolveEmpty({
      availability: this.availability,
      rawEmpty: this.#rawEmpty,
      settled: this.settled,
      status: this.#status,
    })
  }

  get isSyncing(): boolean {
    return this.#confirming.some((query) => query.details.type === 'unknown')
  }

  get settled(): boolean {
    return this.#settled || (!isOnline() && resolveKept(this.#keptInput()))
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

  #register: (() => QueryRequest[]) | undefined

  // What the server must confirm: the query itself, or in a composite the named queries it
  // registers, since its local read is never sent and so never completes.
  #confirming = $derived.by(() => {
    if (this.#register == null) {
      return [this.#query]
    }

    return this.#register().map((request) => {
      const query = getZ().createQuery(request, this.#enabled())
      query.view?.ensureSubscribed()
      return query
    })
  })

  #select: (data: HumanReadable<TReturn>) => TOut

  #data = $derived.by(() => this.#select(this.#query.data))

  #offline: OfflinePolicy | undefined

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

  #settled = $derived.by(() => {
    const views = this.#confirming.map((query) => query.view)
    const next = resolveSettled({
      complete: this.isComplete,
      latched: this.#settledLatch,
      sameView: sameViews(views, this.#settledViews),
    })
    this.#settledViews = views
    this.#settledLatch = next
    return next
  })

  #status: ResourceStatus = $derived.by(() => {
    if (this.#confirming.some((query) => query.details.type === 'error')) {
      return 'error'
    }

    // Stale-while-revalidate: local rows (e.g. from the initZero preloads)
    // render immediately even before the server confirms, so only an *empty*
    // unknown result counts as loading.
    if (!this.isComplete && this.#rawEmpty) {
      return 'loading'
    }

    return 'ready'
  })

  constructor(
    request: () => QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
    select: (data: HumanReadable<TReturn>) => TOut,
    enabled: () => boolean,
    offline: OfflinePolicy | undefined,
    register: (() => QueryRequest[]) | undefined,
  ) {
    this.#request = request
    this.#select = select
    this.#enabled = enabled
    this.#offline = offline
    this.#register = register
  }

  #keptInput = () => ({
    fieldDevice: isFieldDevice(),
    guidebookSynced: lastSyncedAt('guidebook') != null,
    policy: this.#offline ?? this.#policy,
    referenceSynced: lastSyncedAt('reference') != null,
  })
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
 * @param opts.register makes this a composite: `request` is then a local-only `zql` read joining
 *   rows these named queries sync, and readiness and offline policy come from them. The read may
 *   reach no table they do not sync (`$lib/zero/coverage` checks that).
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
  opts?: { enabled?: () => boolean; offline?: OfflinePolicy; register?: () => QueryRequest[] },
): QueryResource<TOut> {
  return new Resource(request, select, opts?.enabled ?? (() => true), opts?.offline, opts?.register)
}

/** Rows on screen with more expected: render them with the affordance, and no total yet. */
export function resolveArriving({
  online,
  settled,
  status,
}: {
  online: boolean
  settled: boolean
  status: ResourceStatus
}): boolean {
  return online && !settled && status === 'ready'
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
  if (resolveKept(input)) {
    return 'ready'
  }

  return 'unsynced'
}

/**
 * Whether an empty result is an answer. Latched like `settled`, so a parked socket does not turn a
 * confirmed absence back into a skeleton. Offline, empty is an answer exactly when
 * `resolveAvailability` says so, which is the only way a never-confirmed query gets here.
 */
export function resolveEmpty({
  availability,
  rawEmpty,
  settled,
  status,
}: {
  availability: Availability
  rawEmpty: boolean
  settled: boolean
  status: ResourceStatus
}): boolean {
  if (!rawEmpty || status === 'error') {
    return false
  }

  return settled || (status === 'loading' && availability === 'ready')
}

/**
 * Whether this device holds the whole answer without asking: the policy keeps it and the preload
 * that fills it finished. The reference stamp does not vouch for the guidebook, which lands later.
 */
export function resolveKept(input: {
  fieldDevice: boolean
  guidebookSynced: boolean
  policy: OfflinePolicy | undefined
  referenceSynced: boolean
}): boolean {
  if (input.policy === 'always') {
    return input.referenceSynced
  }

  return input.policy === 'field' && input.guidebookSynced && input.fieldDevice
}

/** Still waiting for an answer. A confirmed absence is one, and offline it is the only kind an empty
 *  result gets, since nothing completes without a connection. */
export function resolveLoading({ isEmpty, status }: { isEmpty: boolean; status: ResourceStatus }): boolean {
  return status === 'loading' && !isEmpty
}

/** A composite's policy: one only when every query it registers agrees, since it is no more kept
 *  than its least kept query and the order of the policies says nothing about which that is. */
export function resolvePolicy(policies: (OfflinePolicy | undefined)[]): OfflinePolicy | undefined {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain function, nothing reads it reactively
  const distinct = new Set(policies)
  return distinct.size === 1 ? [...distinct][0] : undefined
}

/**
 * The settled latch, as a function of its inputs and nothing else. Same reason as
 * `resolveAvailability` below: `Resource` needs `getZ()` and cannot be constructed in a test.
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
 * Offline with nothing confirmed for this request: the offline notice's case. Never true while merely
 * loading online, and never once the request was confirmed, so a signal blip keeps a list on screen.
 */
export function resolveUnavailable({
  availability,
  settled,
}: {
  availability: Availability
  settled: boolean
}): boolean {
  return !settled && (availability === 'excluded' || availability === 'unsynced')
}

/** Whether a composite still watches the same views, in order. Any change is a new request. */
export function sameViews(next: unknown[], previous: unknown[]): boolean {
  return next.length === previous.length && next.every((view, i) => view === previous[i])
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
