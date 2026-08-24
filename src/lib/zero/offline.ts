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
 * Now `preloadForOffline` iterates this table and every resource reads its own entry through
 * {@link offlinePolicyOf}, keyed on the query name Zero already carries at runtime. Adding a query
 * to the guidebook and teaching every screen that renders it are the same edit.
 *
 * Settled with the user; do not widen it without asking, the cost is not local. Each pinned row
 * costs roughly 510 bytes of CVR per client group on the server, so a fully preloaded user is about
 * 4.6 MB. Rows pinned is the expensive axis, not query count.
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
