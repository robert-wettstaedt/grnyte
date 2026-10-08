import { describe, expect, it } from 'vitest'
import { astOf, uncovered, type Ast } from './coverage'
import { guidebookQueryDefs } from './guidebook'
import { EXCLUDED, FIELD_STAGES, GUIDEBOOK_COVERED, KEPT, offlinePolicyOf, type KeepContext } from './offline'
import { queries } from './queries'

/** Lookups that always answer, so every entry builds the request it would issue. */
const ctx: KeepContext = { regionFks: async () => [1], userId: async () => 1 }

describe('the offline keep table', () => {
  it('builds, for every kept query, a request for that same query', async () => {
    for (const stage of Object.values(KEPT)) {
      for (const [name, build] of Object.entries(stage.queries)) {
        const request = (await build(ctx)) as null | { query: { queryName: string } }
        expect([name, request?.query.queryName]).toEqual([name, name])
      }
    }
  })

  it('preloads nothing it says is excluded', () => {
    const kept = Object.values(KEPT).flatMap((stage) => Object.keys(stage.queries))
    expect(EXCLUDED.filter((name) => kept.includes(name))).toEqual([])
  })

  it('answers each query with the policy of the table that lists it, and nothing else', () => {
    for (const stage of Object.values(KEPT)) {
      for (const name of Object.keys(stage.queries)) expect([name, offlinePolicyOf(name)]).toEqual([name, stage.policy])
    }
    for (const name of EXCLUDED) expect([name, offlinePolicyOf(name)]).toEqual([name, 'excluded'])
    for (const name of GUIDEBOOK_COVERED) expect([name, offlinePolicyOf(name)]).toEqual([name, 'field'])
    expect(offlinePolicyOf('ascent')).toBeUndefined()
  })

  it('preloads every stage: the reference one first, then each field stage', () => {
    expect(new Set([KEPT.reference, ...FIELD_STAGES])).toEqual(new Set(Object.values(KEPT)))
  })

  it('classifies each query at most once', () => {
    const all = [
      ...Object.values(KEPT).flatMap((stage) => Object.keys(stage.queries)),
      ...EXCLUDED,
      ...GUIDEBOOK_COVERED,
    ]

    expect(all.length).toBe(new Set(all).size)
  })
})

function astOfQuery(name: keyof typeof queries, args: unknown): Ast {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design
  return astOf((queries[name] as any).fn({ args, ctx: { authUserId: 'drift' } }))
}

const ROUTE_FILTERS = {
  areaId: 1,
  content: 'x',
  firstAscensionists: [1],
  // Off: beta videos live on route files and other people's ascents, which no preload has ever
  // kept, so this filter is already unanswerable offline. On, it would excuse a `files` relation.
  hasBeta: false,
  hasTopo: true,
  maxGrade: 1,
  minGrade: 1,
  minRating: 1,
  references: 'x',
  regionFk: 1,
  routeId: 1,
  tags: ['x'],
}

/** Every filter switched on, so a table reached only through a filter's `exists` counts too. */
const EVERY_BRANCH = {
  block: { areaId: 1, blockId: 1 },
  listAreas: { content: 'x', id: 1, limit: 1, parentFk: 1, references: 'x' },
  listBlocks: { areaId: 1, blockId: 1, content: 'x', limit: 1, references: 'x' },
  listRoutes: ROUTE_FILTERS,
  listRoutesForMap: ROUTE_FILTERS,
} satisfies Record<(typeof GUIDEBOOK_COVERED)[number], object>

describe('the guidebook covers every query that claims it', () => {
  const guidebook = Object.keys(guidebookQueryDefs).map((name) => astOfQuery(name as keyof typeof queries, undefined))

  it.each(GUIDEBOOK_COVERED)('%s reaches nothing the guidebook does not sync', (name) => {
    expect(uncovered([astOfQuery(name, {}), astOfQuery(name, EVERY_BRANCH[name])], guidebook)).toEqual([])
  })
})
