import type { QueryContext } from '$lib/zero/permissions'
/**
 * The feed's route relation must carry everything `toRouteListItem` reads. `EventRow['route']` is
 * `any`, so the two query shapes can drift with no error: drop a `related` from `listEvents` and
 * every feed card silently renders `undefined`. Only the query's own AST can catch that.
 *
 * A SUPERSET check, one direction: relating more than the mapper needs is not a defect.
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

    // Both non-empty FIRST, on the same two locals the comparison reads: the superset check is
    // vacuous if either collapses, and `relationPaths` returns `[]` for a changed AST shape.
    // A separate test would call the builders again and pin a different pair of values.
    expect(inEvent.length).toBeGreaterThan(0)
    expect(inList.length).toBeGreaterThan(0)

    // `blocks.areas` is the one to watch: `areaName` comes from it, two levels down.
    expect(inEvent).toContain('blocks.areas')
    expect(inList.filter((path) => !inEvent.includes(path))).toEqual([])
  })
})
