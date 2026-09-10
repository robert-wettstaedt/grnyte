import type { QueryContext } from '$lib/zero/permissions'
/**
 * The feed's route relation must carry everything `toRouteListItem` reads.
 *
 * `mapper.ts` turns an event's route into a feed card with
 * `toRouteListItem(route as unknown as RouteListRow)`, and that cast converts nothing, because
 * `EventRow['route']` resolves to `any` (see the `IsAny` tripwire beside it). So the two query
 * shapes can drift apart with no error anywhere: drop a `related` from `listEvents` and every feed
 * card renders `undefined` for whatever the mapper read from it, silently, on a screen nobody
 * typechecks. A structural assertion cannot catch it either, since `any` satisfies every shape.
 *
 * What can catch it is the query's own AST, the same instrument `block/order.server.test.ts` uses
 * to pin a call site the helpers could not. Named `.server.` for the node project.
 *
 * Deliberately a SUPERSET check rather than equality: `listEvents` may relate more than the route
 * mapper needs (it does not today), and adding to it is not a defect. Missing something is.
 *
 * One direction only, and worth knowing which. It catches `listEvents` failing to relate something
 * `listRoutes` has, which is the drift that silently blanks a feed card. It does NOT catch
 * `listRoutes` losing a relation the mapper still reads: the superset holds trivially and both
 * queries break together, which is a real bug but a different one, and it surfaces wherever
 * `listRoutes` itself is exercised.
 */
import { queries } from '$lib/zero/queries'
import { describe, expect, it } from 'vitest'

/** Nothing here executes a query; it only inspects the one that was built. */
const ctx: QueryContext = { authUserId: '00000000-0000-0000-0000-000000000000' }

/* eslint-disable @typescript-eslint/no-explicit-any -- the registry is heterogeneous, as in `tenancy.test.ts` */
const build = (name: 'listEvents' | 'listRoutes'): any => (queries as any)[name].fn({ args: {}, ctx }).ast

/** The `route` subquery inside `listEvents`, which is what the feed card is built from. */
function eventRouteRelations(): string[] {
  const events = build('listEvents')
  const route = (events.related ?? []).find((related: any) => related.subquery.table === 'routes')
  return relationPaths(route?.subquery)
}

/** Every relation the query pulls, as dotted paths, so a nested one is compared too. */
function relationPaths(ast: any, prefix = ''): string[] {
  return (ast?.related ?? []).flatMap((related: any) => {
    const path = prefix === '' ? related.subquery.table : `${prefix}.${related.subquery.table}`
    return [path, ...relationPaths(related.subquery, path)]
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('the feed route relation', () => {
  it('carries every relation the route list mapper reads', () => {
    const inEvent = eventRouteRelations()
    const inList = relationPaths(build('listRoutes'))

    // Both non-empty FIRST, on the same two values the comparison below reads. The superset check
    // is vacuous if either collapses: `[].filter(...)` is `[]` and passes having compared nothing.
    // `relationPaths` uses `ast?.related ?? []`, so a changed AST shape returns an empty list
    // rather than throwing, which is the defensive default that would hide it. Asserting this in a
    // separate test would not do: that calls the builders again and pins a different pair of
    // values, so an edit to these two would sail past it.
    expect(inEvent.length).toBeGreaterThan(0)
    expect(inList.length).toBeGreaterThan(0)

    // `blocks.areas` is the one to watch: it is where `areaName` comes from, and it is two levels
    // down, which is the kind of relation an unrelated edit drops without noticing.
    expect(inEvent).toContain('blocks.areas')
    expect(inList.filter((path) => !inEvent.includes(path))).toEqual([])
  })
})
