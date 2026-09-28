import type { RouteDetail } from './dto'
import { routeListsFingerprint } from './fingerprint'
import type { RouteFormInput } from './routes.remote'

/** One copy, because `known` is a correctness guard: a second seed covering different lists would
 *  make one surface refuse every save. `satisfies` keeps the excess-property check a call-site
 *  literal used to get. */
export function routeEditSeed(route: RouteDetail) {
  return {
    blockId: String(route.blockFk),
    description: route.description,
    firstAscentYear: route.firstAscentYear == null ? '' : String(route.firstAscentYear),
    id: String(route.id),
    known: routeListsFingerprint(route.tags, route.firstAscents),
    name: route.rawName,
  } satisfies Partial<RouteFormInput>
}
