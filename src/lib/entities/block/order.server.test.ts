/**
 * The two halves of the block ordering rule, asserted against each other and against the call
 * site. They sit in different files in two query languages, and no compiler can compare them.
 *
 * The last test reads the ordering off the BUILT query: asserting the helpers agree leaves
 * inlining the ordering back into `queries.ts` green, which is the failure to prevent.
 */
import { blocks } from '$lib/db/schema'
import { blocksQueryDefs } from '$lib/entities/block/queries'
import type { QueryContext } from '$lib/zero/permissions'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { acrossAreasOrder, inAreaOrder, type BlockQuery } from './order'
import { inAreaOrderSql } from './order.server'

/** One `orderBy` call, typed off the real query so a renamed column stops this compiling. */
type Ordering = Parameters<BlockQuery['orderBy']>

/** A stand-in for a zql query that records what was asked of it. */
function recorder() {
  const calls: Ordering[] = []
  const q = {
    orderBy(...args: Ordering) {
      calls.push(args)
      return q
    },
  }
  return { calls, q }
}

/** The columns AND directions the drizzle clause names, read back off the SQL it renders. */
function serverOrdering(): string[][] {
  const rendered = new PgDialect().sqlToQuery(sql.join(inAreaOrderSql(blocks), sql`, `)).sql
  return [...rendered.matchAll(/"(\w+)" (asc|desc)/gi)].map((match) => [match[1], match[2].toLowerCase()])
}

/** No memberships needed: nothing here executes a query, it only inspects the one that was built. */
const ctx: QueryContext = { authUserId: '00000000-0000-0000-0000-000000000000' }

/** The ordering `listBlocks` actually builds for `args`, off the query's own AST. */
function builtOrdering(args: Record<string, unknown>): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous, as in `tenancy.test.ts`
  const def = blocksQueryDefs.listBlocks as unknown as { fn: (options: any) => { ast: { orderBy: unknown } } }
  return def.fn({ args, ctx }).ast.orderBy
}

const IN_AREA: Ordering[] = [
  ['order', 'asc'],
  ['id', 'asc'],
]
const ACROSS_AREAS: Ordering[] = [
  ['name', 'asc'],
  ['id', 'asc'],
]

describe('block ordering', () => {
  it('orders blocks in an area by slot, then id', () => {
    const { calls, q } = recorder()
    inAreaOrder(q as never)
    expect(calls).toEqual(IN_AREA)
  })

  it('has the client read and the renumbering rule name the same columns in the same directions', () => {
    // Directions compared too, not just column names: a server `desc` would otherwise fail on
    // length and point at the wrong thing.
    const { calls, q } = recorder()
    inAreaOrder(q as never)
    expect(serverOrdering()).toEqual(calls)
  })

  it('drops the slot entirely across areas, and still ends on id', () => {
    // `order` is a position inside one area, so ordering a cross-area list by it buckets on
    // nothing. The trailing `id` is explicitness: Zero appends the primary key either way.
    const { calls, q } = recorder()
    acrossAreasOrder(q as never)
    expect(calls).toEqual(ACROSS_AREAS)
  })

  it('picks the rule off `areaId` at the call site, not just in the helpers', () => {
    // The built query, not the helper: everything above stays green if `queries.ts` stops
    // calling them.
    expect(builtOrdering({ areaId: 1 })).toEqual(IN_AREA)
    expect(builtOrdering({})).toEqual(ACROSS_AREAS)
    // `null` matches no rows (`blocks.areaFk` is not null). Pinned because the sort branches on
    // `=== undefined` and the `where` on `!== undefined`, and those two must agree.
    expect(builtOrdering({ areaId: null })).toEqual(IN_AREA)
  })
})
