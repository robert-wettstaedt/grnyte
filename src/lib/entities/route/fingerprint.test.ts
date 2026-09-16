/**
 * `routeListsFingerprint` lets the route form prove which lists it replaces. A count cannot: a
 * delete plus an add leaves it unchanged. `[] / []` is what an unloaded form posts, so that case
 * matters most.
 */
import { describe, expect, it } from 'vitest'
import { routeListsFingerprint, type FingerprintClimber } from './fingerprint'

const climber = (name: string, userFk?: number): FingerprintClimber => ({ name, userFk })

describe('routeListsFingerprint', () => {
  it('is stable across two reads of the same lists', () => {
    expect(routeListsFingerprint(['a', 'b'], [climber('Ada', 1)])).toBe(
      routeListsFingerprint(['a', 'b'], [climber('Ada', 1)]),
    )
  })

  it('tells the empty pair apart from every real one, which is what a never-loaded form posts', () => {
    const unloaded = routeListsFingerprint([], [])

    expect(unloaded).not.toBe(routeListsFingerprint(['a'], []))
    expect(unloaded).not.toBe(routeListsFingerprint([], [climber('Ada')]))
    expect(unloaded).not.toBe(routeListsFingerprint(['a'], [climber('Ada')]))
  })

  it('changes when one tag is swapped for another, which a count does not', () => {
    const loaded = ['benchmark', 'defined', 'high']
    const now = ['benchmark', 'defined', 'lowball']

    expect(loaded).toHaveLength(now.length)
    expect(routeListsFingerprint(loaded, [])).not.toBe(routeListsFingerprint(now, []))
  })

  it('changes when one first ascensionist is swapped for another', () => {
    const loaded = [climber('Ada', 1), climber('Bea', 2)]
    const now = [climber('Ada', 1), climber('Cyd', 3)]

    expect(routeListsFingerprint([], loaded)).not.toBe(routeListsFingerprint([], now))
  })

  it('ignores order, because neither list has an order the reader chose', () => {
    // Unlike `mapLayersFingerprint`, where a reorder IS the edit. These arrive in query order.
    expect(routeListsFingerprint(['b', 'a'], [])).toBe(routeListsFingerprint(['a', 'b'], []))
    expect(routeListsFingerprint([], [climber('Bea', 2), climber('Ada', 1)])).toBe(
      routeListsFingerprint([], [climber('Ada', 1), climber('Bea', 2)]),
    )
  })

  it('counts a linked account as part of the climber, not decoration', () => {
    // Each side reads `userFk` from a different place. If either dropped it, both stay
    // self-consistent and every save of a route with a linked climber refuses, unexplainably.
    expect(routeListsFingerprint([], [climber('Ada', 1)])).not.toBe(routeListsFingerprint([], [climber('Ada')]))
    expect(routeListsFingerprint([], [climber('Ada', 1)])).not.toBe(routeListsFingerprint([], [climber('Ada', 2)]))
  })

  it('ignores order for two climbers who share a name, where only the account separates them', () => {
    const pair = [climber('Ada', 1), climber('Ada', 2)]

    expect(routeListsFingerprint([], pair)).toBe(routeListsFingerprint([], [...pair].reverse()))
  })

  it('ignores order for a shared name where only one of the two has an account at all', () => {
    // The common shape: most first ascensionists are names, not users.
    const pair = [climber('Ada'), climber('Ada', 2)]

    expect(routeListsFingerprint([], pair)).toBe(routeListsFingerprint([], [...pair].reverse()))
  })

  it('ignores order when the names and the accounts disagree about what it is', () => {
    // Ada sorts first by name and second by account. Sorting by either alone is order-independent,
    // so this says the fingerprint is stable, and the literal below says which order it settled on.
    const pair = [climber('Ada', 9), climber('Bea', 2)]

    expect(routeListsFingerprint([], pair)).toBe(routeListsFingerprint([], [...pair].reverse()))
  })

  it('freezes the order the comparator settled on, so a reordering cannot mint a new hash quietly', () => {
    // Generated from this implementation, unlike the browser-observed literals below. Both sides
    // build the list from different rows, so the comparator is the only thing making them agree.
    expect(routeListsFingerprint([], [climber('Ada', 9), climber('Bea', 2)])).toBe('0.2-n44z7u')
  })

  it('separates two climbers who share a name', () => {
    expect(routeListsFingerprint([], [climber('Ada', 1), climber('Ada', 2)])).not.toBe(
      routeListsFingerprint([], [climber('Ada', 1)]),
    )
  })

  it('leads with the two counts, which is what the e2e seeding spec asserts on', () => {
    // `e2e/form-seeding.spec.ts` matches /^0\.0-/, which needs the counts in front, in this order.
    expect(routeListsFingerprint([], [])).toMatch(/^0\.0-/)
    expect(routeListsFingerprint(['a'], [climber('Ada')])).toMatch(/^1\.1-/)
    expect(routeListsFingerprint(['a', 'b'], [])).toMatch(/^2\.0-/)
  })

  it('reproduces fingerprints a real browser posted, which is the cross-implementation pin', () => {
    // Read off a live form's hidden `known` input before this hash was extracted. Client and server
    // build these from different rows, so a literal surviving that is the evidence they agree.
    expect(routeListsFingerprint([], [climber('Testa Erstbegeherin', 6)])).toBe('0.1-lceycp')
    expect(routeListsFingerprint(['benchmark'], [climber('test', 6)])).toBe('1.1-19zov1u')
    expect(routeListsFingerprint([], [])).toBe('0.0-azyor3')
  })
})
