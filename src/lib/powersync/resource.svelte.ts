import { page } from '$app/state'
import { isOnline } from '$lib/state/online.svelte'
import { resolvePhase, type QueryPhase, type QueryResource } from '$lib/zero/resource.svelte'
import { eq, type Context, type InferResultType, type InitialQueryBuilder, type QueryBuilder } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/svelte-db'
import { collections } from './collections'
import { getPowerSync, powerSyncStatus, streamConfirmed } from './db.svelte'
import { changedRows } from './rows'

type Live<T> = { data: T; isReady: boolean }

/**
 * A TanStack DB live query as the app's `QueryResource`, so `QueryState` and `summaryOf` read it unchanged.
 * Online it answers once its stream has synced this session; until then the rows on disk show as arriving.
 * Offline, a stream that ever synced answers from disk: every device holds the whole region. Never `error`:
 * PowerSync retries a failed download itself, and offline it always reports one. A query joining tables from
 * several streams names them all, and answers once every one of them has. Disabled, it is loading, as Zero's is.
 */
export function psResource<TContext extends Context, TOut>(
  query: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  deps: (() => unknown)[],
  select: (rows: InferResultType<TContext>) => TOut,
  stream: string | string[] = 'guidebook',
  opts?: { enabled?: () => boolean },
): QueryResource<TOut> {
  // Disabled, no query at all: TanStack would otherwise build it in full and only the output would be hidden.
  const enabled = () => opts?.enabled?.() !== false
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

  return {
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
}
