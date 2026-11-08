import { page } from '$app/state'
import { isOnline } from '$lib/state/online.svelte'
import { holdWhileArriving, resolvePhase, type QueryPhase, type QueryResource } from '$lib/zero/resource.svelte'
import { eq, type Context, type InferResultType, type InitialQueryBuilder, type QueryBuilder } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/svelte-db'
import { collections } from './collections'
import { getPowerSync, powerSyncStatus, streamConfirmed } from './db.svelte'
import { changedRows } from './rows'
import { matchesText } from './text'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's ref types do not survive a helper
type AnyQuery = any
type Live<T> = { data: T; isReady: boolean }
type TextFilter = { content?: string; limit?: number; references?: string }

/**
 * A list a text match or a cap narrows: `hits` matches the bare rows in JS and returns the ids in order, `found`
 * reads only those rows in full. Building every row's related rows for a whole region is the cost. Not
 * narrowed, `all` answers.
 */
export function narrowedList<T extends { id: number }>(
  narrowed: () => boolean,
  all: QueryResource<T[]>,
  hits: QueryResource<number[]>,
  found: QueryResource<T[]>,
): QueryResource<T[]> {
  const ranked = $derived.by(() => {
    const rank: Record<number, number> = Object.fromEntries(hits.data.map((id, index) => [id, index]))
    // `found` can still hold the previous hits' rows while it rebuilds.
    return found.data.filter((item) => item.id in rank).toSorted((a, b) => rank[a.id] - rank[b.id])
  })
  return {
    get data() {
      if (!narrowed()) return all.data
      return hits.data.length > 0 ? ranked : []
    },
    get phase() {
      if (!narrowed()) return all.phase
      // Until the match settles, or when it matched nothing, the match speaks; then the hits' own rows do.
      return hits.phase.kind !== 'answered' || hits.data.length === 0 ? hits.phase : found.phase
    },
  }
}

/**
 * A TanStack DB live query as the app's `QueryResource`, so `QueryState` and `summaryOf` read it unchanged.
 * Online it answers once its stream has synced this session; until then the rows on disk show as arriving.
 * Offline, a stream that ever synced answers from disk: every device holds the whole region. Never `error`:
 * PowerSync retries a failed download itself, and offline it always reports one. A query joining tables from
 * several streams names them all, and answers once every one of them has. Disabled, it is loading, as Zero's is.
 * Arriving, it holds the nearest pill unless built `quietly`.
 */
export function psResource<TContext extends Context, TOut>(
  query: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  deps: (() => unknown)[],
  select: (rows: InferResultType<TContext>) => TOut,
  stream: string | string[] = 'guidebook',
  opts?: { enabled?: () => boolean },
): QueryResource<TOut> {
  // Disabled, no query at all: TanStack would otherwise build it in full and only the output would be hidden.
  // Derived, so a gate reading typed text rebuilds the query only when its answer flips.
  const on = $derived(opts?.enabled?.() !== false)
  const enabled = () => on
  const live = useLiveQuery((q) => (enabled() ? query(q) : undefined), [...deps, enabled]) as Live<
    InferResultType<TContext>
  >
  return resourceOf(live, deps, select, () => stream, opts)
}

/** The signed-in auth id as a dep that fires when the id changes, not on every `page.data` replacement:
 *  each fire rebuilds the live query. */
export function signedInAuthId(): () => string {
  const id = $derived(page.data.session?.user.id ?? '')
  return () => id
}

/**
 * A statement from `sql.ts`, watched, as a `QueryResource` that answers as {@link psResource} does. For what a
 * TanStack query cannot express (EXISTS filters). `streams` names every stream the statement reads.
 */
export function sqlResource<Row, TOut>(
  sql: () => string,
  parameters: () => (null | number | string)[],
  select: (rows: Row[]) => TOut,
  streams: () => string | string[],
  opts?: { enabled?: () => boolean },
): QueryResource<TOut> {
  let live = $state.raw<Live<Row[]>>({ data: [], isReady: false })
  // Strings, so an equal but rebuilt filter keeps its watch: a derived array compares by identity.
  const key = $derived(JSON.stringify([sql(), parameters()]))
  const on = $derived(opts?.enabled?.() !== false)
  $effect(() => {
    // New parameters answer nothing until their own first result: the old rows are another query's.
    live = { data: [], isReady: false }
    if (!on) return
    const [statement, values] = JSON.parse(key) as [string, (null | number | string)[]]
    // Every write to a table the statement reads re-runs it; only a changed result reaches the screen.
    const watched = getPowerSync()
      .query<Row>({ parameters: values, sql: statement })
      .watch({ comparator: changedRows<Row>() })
    const stop = watched.registerListener({
      onData: (data) => void (live = { data: [...data], isReady: true }),
      onError: (error) => console.error('PowerSync watched query failed', error),
    })
    return () => {
      stop()
      void watched.close()
    }
  })
  const current = {
    get data() {
      return live.data
    },
    get isReady() {
      return live.isReady
    },
  }
  return resourceOf(current, [sql, parameters], select, streams, opts)
}

/**
 * A TanStack list whose rows carry related rows, narrowed by a text match or a cap as {@link narrowedList} reads
 * it. A keystroke (text only) rebuilds no live query: every value its builds read is derived.
 */
export function treeList<F extends TextFilter, T extends { id: number }>(
  filter: () => F,
  query: {
    /** The rows with these ids. */
    byIds: (q: InitialQueryBuilder, ids: number[]) => AnyQuery
    /** The bare rows, filtered and ordered by everything but text and limit. */
    rows: (q: InitialQueryBuilder, filter: F) => AnyQuery
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tree row's shape is the caller's
    toItem: (row: any) => T
    /** A bare query with its related rows. */
    trees: (q: InitialQueryBuilder, rows: AnyQuery) => AnyQuery
  },
  opts?: { enabled?: () => boolean },
): QueryResource<T[]> {
  const narrowed = $derived(filter().content != null || filter().limit != null)
  const on = $derived(opts?.enabled?.() !== false)
  // Everything but text and limit, as a string: JSON drops the undefined keys.
  const shape = $derived(JSON.stringify({ ...filter(), content: undefined, limit: undefined }))
  const bare = (q: InitialQueryBuilder) => query.rows(q, JSON.parse(shape) as F)
  const toItems = (rows: unknown[]) => rows.map(query.toItem)

  const all = psResource((q) => query.trees(q, bare(q)), [() => shape], toItems, 'guidebook', {
    enabled: () => !narrowed && on,
  })
  const hits = psResource(
    bare,
    [() => shape],
    (rows) =>
      (rows as { description?: null | string; name?: null | string; nid: number }[])
        .filter(matchesText(filter()))
        .slice(0, filter().limit)
        .map((row) => row.nid),
    'guidebook',
    { enabled: () => narrowed && on },
  )
  const ids = $derived(hits.data.join())
  const found = psResource(
    (q) => query.trees(q, query.byIds(q, ids.split(',').map(Number))),
    [() => ids],
    toItems,
    'guidebook',
    { enabled: () => narrowed && on && ids !== '' },
  )
  return narrowedList(() => narrowed, all, hits, found)
}

/**
 * Resolve once the row with integer id `nid` is in the local store, or after `timeoutMs`. A server write reaches
 * the device only after replication, so navigating to a new row first awaits this rather than flashing "not found".
 */
export function waitForSynced(table: 'areas' | 'blocks' | 'routes', nid: number, timeoutMs = 5000): Promise<void> {
  let found = () => {}
  const settled = new Promise<void>((resolve) => (found = resolve))
  const timer = setTimeout(found, timeoutMs)
  // The initial state can answer before `subscribeChanges` returns, so it is torn down after `settled`, not inside.
  const subscription = (collections()[table] as ReturnType<typeof collections>['blocks']).subscribeChanges(
    (changes) => {
      if (changes.some((change) => change.type !== 'delete')) found()
    },
    { includeInitialState: true, where: (row) => eq(row.nid, nid) },
  )
  return settled.then(() => {
    clearTimeout(timer)
    subscription.unsubscribe()
  })
}

function resourceOf<TRows, TOut>(
  live: Live<TRows>,
  deps: (() => unknown)[],
  select: (rows: TRows) => TOut,
  stream: () => string | string[],
  opts?: { enabled?: () => boolean },
): QueryResource<TOut> {
  const streams = $derived([stream()].flat())
  const everSynced = $derived(
    streams.every((name) => powerSyncStatus()?.forStream({ name, parameters: null })?.subscription.hasSynced === true),
  )
  const enabled = () => opts?.enabled?.() !== false
  // Disabled, nothing: as Zero's unmaterialized query, whatever the live query has found.
  const data = $derived(select((enabled() ? live.data : []) as TRows))
  // Latched per query, as Zero's is: coming back online must not turn an answer back into arriving.
  const queryKey = $derived(JSON.stringify(deps.map((dep) => dep())))
  let latched: string | undefined

  const resource: QueryResource<TOut> = {
    get data() {
      return data
    },
    // fallow-ignore-next-line complexity -- psResource's phase moved unchanged; the CRAP estimate rose only because its holder is no longer exported
    get phase(): QueryPhase {
      if (!enabled()) return { kind: 'loading' }
      const online = isOnline()
      const settled = live.isReady && (online ? streams.every(streamConfirmed) : everSynced)
      if (settled) latched = queryKey
      const answered = live.isReady && (settled || latched === queryKey)
      // The selection when it is a list or nothing: a filter applied there can leave nothing of rows the query matched.
      const shown = Array.isArray(data) || data === undefined ? data : (live.data as unknown)
      const rawEmpty = shown == null || (Array.isArray(shown) && shown.length === 0)
      return resolvePhase({
        excluded: false,
        online,
        rawEmpty,
        settled: answered,
        // Nothing yet and nothing confirmed is loading, as Zero's is: arriving would render a screen with no row.
        status: live.isReady && everSynced && (answered || !rawEmpty) ? 'ready' : 'loading',
      })
    },
  }
  holdWhileArriving(resource)
  return resource
}
