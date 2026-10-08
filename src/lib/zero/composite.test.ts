import { describe, expect, it } from 'vitest'
import { astOf, uncovered } from './coverage'
import { guidebookReadRegistrations, guidebookReads } from './guidebook'
import { queries } from './queries'
import { resolvePolicy, sameViews } from './resource.svelte'

describe('a composite resource', () => {
  it('takes the policy its registered queries share', () => {
    expect(resolvePolicy(['field', 'field'])).toBe('field')
  })

  it('claims no policy when they disagree, whatever the order', () => {
    expect(resolvePolicy(['field', 'always'])).toBeUndefined()
    expect(resolvePolicy(['always', 'field'])).toBeUndefined()
    expect(resolvePolicy(['field', undefined])).toBeUndefined()
  })

  it('keeps its latch only while it watches the same views', () => {
    const a = {}
    const b = {}
    expect(sameViews([a, b], [a, b])).toBe(true)
    expect(sameViews([a, b], [b, a])).toBe(false)
    expect(sameViews([a], [a, b])).toBe(false)
    // One view swapped out is a new request, even with the other unchanged.
    expect(sameViews([a, b], [a, {}])).toBe(false)
  })
})

describe('the map reads', () => {
  const registered = guidebookReadRegistrations.map((name) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design
    astOf((queries[name] as any).fn({ ctx: { authUserId: 'x' } })),
  )

  it.each(Object.keys(guidebookReads) as (keyof typeof guidebookReads)[])(
    'the %s read reaches nothing its registered queries do not sync',
    (name) => {
      expect(uncovered([astOf(guidebookReads[name]())], registered)).toEqual([])
    },
  )
})

describe('the guidebook', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design
  const ast = (name: string) => astOf((queries as any)[name].fn({ ctx: { authUserId: 'x' } })) as unknown

  /** Every `exists` subquery in a where clause, with whether it filters on liveness. */
  const parents = (node: unknown, found: string[] = []): string[] => {
    if (node == null || typeof node !== 'object') return found
    const record = node as { related?: { subquery: { alias?: string; where?: unknown } }; type?: string }
    if (record.type === 'correlatedSubquery' && record.related != null) {
      const { alias = '', where } = record.related.subquery
      found.push(`${alias.replace(/^zsubq_/, '')}:${JSON.stringify(where ?? null).includes('"deletedAt"')}`)
    }
    for (const value of Object.values(node)) parents(value, found)
    return found
  }

  it('drops a deleted place: its row, and coordinates and photos only under a live parent', () => {
    for (const name of ['guidebookAreas', 'guidebookBlocks', 'guidebookRoutes']) {
      expect([name, JSON.stringify(ast(name)).includes('"deletedAt"')]).toEqual([name, true])
    }
    expect(parents((ast('guidebookGeolocations') as { where: unknown }).where).sort()).toEqual([
      'area:true',
      'block:true',
    ])
    expect(parents((ast('guidebookTopos') as { where: unknown }).where)).toEqual(['block:true'])
  })
})
