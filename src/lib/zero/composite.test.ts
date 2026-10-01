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
