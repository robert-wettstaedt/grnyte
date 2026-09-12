/**
 * `topoLinesFingerprint` lets a Save prove which line set it replaces. Route ids only, because that
 * is what the delete is keyed on: membership changes the value, a moved line does not.
 */
import { describe, expect, it } from 'vitest'
import { topoLinesFingerprint } from './fingerprint'

describe('topoLinesFingerprint', () => {
  it('is stable across two reads of the same routes', () => {
    expect(topoLinesFingerprint([3, 1, 2])).toBe(topoLinesFingerprint([3, 1, 2]))
  })

  it('tells an empty photo apart from a drawn one, which is what an unloaded editor would post', () => {
    expect(topoLinesFingerprint([])).not.toBe(topoLinesFingerprint([1]))
  })

  it('changes when a line is added, which is the concurrent-edit case it exists for', () => {
    // Two admins on one photo. The second editor loaded [1, 2]; the first drew a line for route 3
    // and saved. Without this the second Save posts [1, 2] and route 3's line is deleted.
    expect(topoLinesFingerprint([1, 2])).not.toBe(topoLinesFingerprint([1, 2, 3]))
  })

  it('changes when one route is swapped for another, which a count does not', () => {
    const loaded = [1, 2, 3]
    const now = [1, 2, 4]

    expect(loaded).toHaveLength(now.length)
    expect(topoLinesFingerprint(loaded)).not.toBe(topoLinesFingerprint(now))
  })

  it('ignores order, because the rows come back in whatever order the query chose', () => {
    expect(topoLinesFingerprint([2, 1])).toBe(topoLinesFingerprint([1, 2]))
  })

  it('collapses a repeated route, because the handler does too', () => {
    // `linesByRoute` is a last-writer-wins Map, so a payload naming one route twice becomes one
    // row. A fingerprint that counted it twice would refuse the save that follows.
    expect(topoLinesFingerprint([1, 1, 2])).toBe(topoLinesFingerprint([1, 2]))
  })

  it('leads with the count, matching the other two fingerprints in the repo', () => {
    expect(topoLinesFingerprint([])).toMatch(/^0-/)
    expect(topoLinesFingerprint([7, 9])).toMatch(/^2-/)
  })
})
