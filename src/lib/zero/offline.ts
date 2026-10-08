import type { SyncStamp } from '$lib/state/sync.svelte'
import { queries } from './queries'

/**
 * What this app keeps on the device, in one place.
 *
 * The policy used to be stated three times and enforced nowhere: a prose comment over a list of
 * `preload` calls said what was kept, six `offlineExcluded` booleans scattered across five
 * directories said what was not, and nothing connected them to each other or to what the sync
 * did. A screen could pass `offlineExcluded` while its rows sat in the replica anyway, and
 * a query added to the preload list gained no offline behaviour in the UI at all.
 *
 * Now every resource reads its own entry through {@link offlinePolicyOf}, keyed on the query name
 * Zero already carries at runtime, so teaching every screen what a query's absence means is one
 * edit here rather than a prop threaded through each of them.
 *
 * The sync half walks this table too ({@link KEPT}, by stage), so adding a kept query is one entry.
 *
 * Settled with the user; do not widen it without asking, the cost is not local. Each pinned row
 * costs roughly 510 bytes of CVR per client group on the server, so a fully preloaded user is about
 * 4.6 MB. Rows pinned is the expensive axis, not query count.
 *
 * A pinned row is also charged a SECOND time, on the client, once per document load. Zero rebuilds
 * its in-memory state from IndexedDB at every boot: `ZeroRep.init` scans every `e/` key in the
 * persisted store, turns each row into an `{op: 'add'}` diff and materialises the lot before the
 * client is usable (`@rocicorp/zero/out/zero-client/src/client/zero-rep.js`). Nothing evicts a
 * preloaded row, because eviction happens when a query de-registers and `preloadForOffline`
 * deliberately never calls `cleanup()`. So whatever this table keeps is re-materialised on every
 * cold start, forever.
 *
 * Measured on a production build at 4x CPU throttle (a mid-range phone), on /settings, whose own
 * query returns one row, so this is the shared floor and not that screen's doing:
 *
 * | routes kept | replica | blocking | LCP     |
 * | ----------- | ------- | -------- | ------- |
 * | 3           | 0.13 MB | 206 ms   | 540 ms  |
 * | 5142        | 3.39 MB | 1214 ms  | 1356 ms |
 *
 * That is ~0.2 ms of boot blocking per route kept, linear, on every authenticated route: 250 routes
 * ~255 ms, 1000 ~400 ms, 2000 ~600 ms, 5000 ~1200 ms. Rocicorp's own Zero demo blocks for 167 ms in
 * total, which is what this floor looks like with a small replica.
 *
 * A region with 5000+ routes is a real one, not a hypothetical, so a reader in it pays about a
 * second of blank screen on every cold start of every route. Nothing in `@rocicorp/zero` fixes
 * that: the scan has no lazy or incremental mode, nothing evicts a preloaded row, and there is no
 * client-startup item on Rocicorp's roadmap. Splitting the guidebook into a second Zero client
 * keyed by `storageKey` does NOT work either, however tempting it looks - `listEvents`,
 * `listRouteAscents` and the notification inbox all `.related()` into routes, blocks and areas, and
 * a Zero query cannot join across two clients, each of which builds its own IVM sources.
 *
 * So the only lever is this table: keep fewer rows. Bounding the guidebook to ~500 routes (the
 * areas a reader chose, rather than `listRoutes({})`) puts a 5000-route region back at
 * ~300 ms, which is where a small region already sits. That is a product decision about what
 * "available offline" promises, which is why it is written here and not quietly changed.
 */

/** Lookups a kept query may need for its arguments, resolved once per sync. */
export interface KeepContext {
  regionFks(): Promise<number[]>
  userId(): Promise<number | undefined>
}

/**
 * - `always`: reference data, preloaded on every device because the app cannot render without it.
 * - `field`: the guidebook. Preloaded only where the reader might lose signal (see
 *   `isFieldDevice`), because this is the part with real server cost.
 * - `personal`: your own logbook and favorites, and your regions' members. Field devices only, and
 *   vouched for by their own stamp, since they sit behind lookups the guidebook does not.
 * - `excluded`: deliberately never kept. These must render as "not available offline" and never as
 *   an empty list, or a gap in the sync reads as a fact about the guidebook.
 *
 * A query with no entry is none of the three: it may or may not have local rows, depending on what
 * the reader happened to browse. Offline and empty, it says "not downloaded", which is the honest
 * answer for something we never promised either way.
 */
export type OfflinePolicy = 'always' | 'excluded' | 'field' | 'personal'

type Build<N extends QueryName> = (ctx: KeepContext) => null | Promise<null | RequestOf<N>> | RequestOf<N>

type Builders = { [N in QueryName]?: Build<N> }
/** Named so the table cannot drift from the registry: a typo is a compile error. */
type QueryName = keyof typeof queries

/** A kept query's request, built from its own registry entry, so it cannot return another query.
 *  `null` skips it (nothing to keep yet, e.g. no regions). */
type RequestOf<N extends QueryName> = (typeof queries)[N] extends (...args: never[]) => infer R ? R : never

/**
 * What is kept, in the order it syncs, each stage with its policy and the stamp its completion
 * writes. `reference` first: the shell waits on it and nothing else may hold it back.
 */
export const KEPT = {
  // The guidebook, as relation-free tables (see `guidebook.ts`): nothing to look up first.
  guidebook: {
    policy: 'field',
    queries: {
      guidebookAreas: () => queries.guidebookAreas(),
      guidebookBlocks: () => queries.guidebookBlocks(),
      guidebookFirstAscensionists: () => queries.guidebookFirstAscensionists(),
      guidebookGeolocations: () => queries.guidebookGeolocations(),
      guidebookRouteFirstAscents: () => queries.guidebookRouteFirstAscents(),
      guidebookRoutes: () => queries.guidebookRoutes(),
      guidebookRouteTags: () => queries.guidebookRouteTags(),
      guidebookTopoRoutes: () => queries.guidebookTopoRoutes(),
      guidebookTopos: () => queries.guidebookTopos(),
    },
    stamp: 'guidebook',
  },
  // Your own logbook and favorites, and your regions' members, which mentions resolve against.
  personal: {
    policy: 'personal',
    queries: {
      listUserAllFavorites: async (ctx) => {
        const userId = await ctx.userId()
        return userId == null ? null : queries.listUserAllFavorites({ userId })
      },
      listUserAscents: async (ctx) => {
        const userId = await ctx.userId()
        return userId == null ? null : queries.listUserAscents({ userId })
      },
      listUsers: async (ctx) => {
        const regionFks = await ctx.regionFks()
        return regionFks.length === 0 ? null : queries.listUsers({ regionFks })
      },
    },
    stamp: 'personal',
  },
  reference: {
    policy: 'always',
    queries: {
      currentUser: () => queries.currentUser(),
      currentUserRole: () => queries.currentUserRole(),
      listGrades: () => queries.listGrades(),
      listRolePermissions: () => queries.listRolePermissions(),
      listUserRegions: () => queries.listUserRegions(),
    },
    stamp: 'reference',
  },
} as const satisfies Record<string, { policy: Exclude<OfflinePolicy, 'excluded'>; queries: Builders; stamp: SyncStamp }>

/** One stage of {@link KEPT}. */
export type KeepStage = (typeof KEPT)[keyof typeof KEPT]

/** What a field device preloads once the reference stage is done. */
export const FIELD_STAGES: readonly KeepStage[] = [KEPT.guidebook, KEPT.personal]

/** Deliberately never kept, and so never preloaded. */
export const EXCLUDED = [
  'listComments',
  'listEvents',
  'listNotifications',
  'listRouteAscents',
] as const satisfies QueryName[]

/**
 * `field` without being preloaded: the screens' own guidebook queries, answered offline from the
 * `guidebook*` rows. `offline.drift.test.ts` fails if one reaches a table those do not sync.
 */
export const GUIDEBOOK_COVERED = [
  'block',
  'listAreas',
  'listBlocks',
  'listRoutes',
  'listRoutesForMap',
] as const satisfies QueryName[]

/** Flattened once, so a lookup per resource read is not a scan of the stages. */
const POLICY_BY_NAME = new Map<string, OfflinePolicy>([
  ...Object.values(KEPT).flatMap((stage) =>
    Object.keys(stage.queries).map((name): [string, OfflinePolicy] => [name, stage.policy]),
  ),
  ...EXCLUDED.map((name): [string, OfflinePolicy] => [name, 'excluded']),
  ...GUIDEBOOK_COVERED.map((name): [string, OfflinePolicy] => [name, 'field']),
])

/**
 * The policy for a query, by the name Zero carries on every request.
 *
 * `undefined` for anything unlisted, which is most of them and is not an omission: see the note on
 * {@link OfflinePolicy}.
 */
export function offlinePolicyOf(queryName: string | undefined): OfflinePolicy | undefined {
  return queryName == null ? undefined : POLICY_BY_NAME.get(queryName)
}
