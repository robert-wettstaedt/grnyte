import type { queries } from './queries'

/**
 * What this app keeps on the device, in one place.
 *
 * The policy used to be stated three times and enforced nowhere: a prose comment over a list of
 * `preload` calls said what was kept, six `offlineExcluded` booleans scattered across five
 * directories said what was not, and nothing connected them to each other or to what the sync
 * actually did. A screen could pass `offlineExcluded` while its rows sat in the replica anyway, and
 * a query added to the preload list gained no offline behaviour in the UI at all.
 *
 * Now every resource reads its own entry through {@link offlinePolicyOf}, keyed on the query name
 * Zero already carries at runtime, so teaching every screen what a query's absence means is one
 * edit here rather than a prop threaded through each of them.
 *
 * The sync half is not driven from this table, and saying otherwise would be the next comment to
 * mislead somebody: `preloadForOffline` and `initZero` still issue their `preload` calls by hand,
 * because each needs arguments (`{}`, a numeric user id, a list of region ids) that a name-keyed
 * table cannot carry, and two of them have to wait on a lookup first. Adding a query to the
 * guidebook is therefore still two edits, here and in `z.svelte.ts`. `offline.drift.test.ts` is
 * what stops those two drifting apart.
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
 * areas a reader actually chose, rather than `listRoutes({})`) puts a 5000-route region back at
 * ~300 ms, which is where a small region already sits. That is a product decision about what
 * "available offline" promises, which is why it is written here and not quietly changed.
 */

/**
 * - `always`: reference data, preloaded on every device because the app cannot render without it.
 * - `field`: the guidebook. Preloaded only where the reader might actually lose signal (see
 *   `isFieldDevice`), because this is the part with real server cost.
 * - `excluded`: deliberately never kept. These must render as "not available offline" and never as
 *   an empty list, or a gap in the sync reads as a fact about the crag.
 *
 * A query with no entry is none of the three: it may or may not have local rows, depending on what
 * the reader happened to browse. Offline and empty, it says "not downloaded", which is the honest
 * answer for something we never promised either way.
 */
export type OfflinePolicy = 'always' | 'excluded' | 'field'

/** Named so the table cannot drift from the registry: a typo is a compile error. */
type QueryName = keyof typeof queries

export const OFFLINE_QUERIES = {
  // Reference data, on every device, because the app cannot render its shell without it.
  // `currentUser` also carries `userSettings`, which the unit and grading-scale formatters read.
  always: ['currentUser', 'currentUserRole', 'listGrades', 'listRolePermissions', 'listUserRegions'],

  // Other people's activity: unbounded, changing constantly, and the least useful thing to read at
  // a crag. Must render as "not available offline", never as an empty list.
  excluded: ['listComments', 'listEvents', 'listNotifications', 'listRouteAscents'],

  // The guidebook. The first three cover it between them because their related trees overlap and
  // Zero syncs the union of active queries rather than a copy per query: `listRoutes` carries tags,
  // first ascents, block, area and topo with its file; `listAreas` the parent chain and parking;
  // `listBlocks` topos with files, area with parent, and the block's own geolocation. No
  // geolocations entry is needed, those two already sync every one we render.
  //
  // Then your own ticks and saves, and everybody in your regions - the one table the guidebook does
  // not reach that descriptions still point at, through `!users:id!` mentions.
  //
  // `listUserAllFavorites` is classified for its only caller, which asks about the signed-in user
  // and is the only one preloaded. Called for somebody else it would promise "connect once and it
  // downloads", which would never come true. No such call site exists; if one appears, it needs the
  // per-usage `offline` override the way `userAscentDetailList` does.
  field: ['listAreas', 'listBlocks', 'listRoutes', 'listUserAllFavorites', 'listUserAscents', 'listUsers'],
} satisfies Record<OfflinePolicy, QueryName[]>

/** Flattened once, so a lookup per resource read is not a scan of three arrays. */
const POLICY_BY_NAME = new Map<string, OfflinePolicy>(
  (Object.entries(OFFLINE_QUERIES) as [OfflinePolicy, QueryName[]][]).flatMap(([policy, names]) =>
    names.map((name): [string, OfflinePolicy] => [name, policy]),
  ),
)

/**
 * The policy for a query, by the name Zero carries on every request.
 *
 * `undefined` for anything unlisted, which is most of them and is not an omission: see the note on
 * {@link OfflinePolicy}.
 */
export function offlinePolicyOf(queryName: string | undefined): OfflinePolicy | undefined {
  return queryName == null ? undefined : POLICY_BY_NAME.get(queryName)
}
