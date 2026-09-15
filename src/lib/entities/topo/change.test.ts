import { describe, expect, it } from 'vitest'
import { diffTopoLines, parseTopoChange, parseTopoLines, stringifyTopoChange, stringifyTopoLines } from './change'

const line = (routeFk: number, over: Partial<{ name: string; path: string; topType: string }> = {}) => ({
  name: `Route ${routeFk}`,
  path: 'M0.1,0.9 L0.2,0.4 Z',
  routeFk,
  topType: 'top',
  ...over,
})

describe('stringifyTopoLines', () => {
  it('round-trips a line whole', () => {
    // The path survives verbatim, which is what lets the feed draw the state rather than
    // only say how many lines it had.
    expect(parseTopoLines(stringifyTopoLines([line(7)]))).toEqual([line(7)])
  })

  it('encodes the same drawing the same way whatever order it arrives in', () => {
    // Zero hands rows back in whatever order it likes; an order-sensitive encoding would
    // read as a redraw on every save.
    expect(stringifyTopoLines([line(7), line(2)])).toBe(stringifyTopoLines([line(2), line(7)]))
  })

  it('survives a name with the separators in it', () => {
    const encoded = stringifyTopoLines([line(1, { name: 'Sit start, left exit: the | variant' })])

    expect(parseTopoLines(encoded)).toEqual([line(1, { name: 'Sit start, left exit: the | variant' })])
  })

  it('drops an entry it cannot read rather than drawing a pointless line', () => {
    expect(parseTopoLines(`nonsense|${stringifyTopoLines([line(1)])}`)).toEqual([line(1)])
  })

  it('reads a name that will not decode rather than throwing under a feed card', () => {
    // A stray `%` is a `URIError`, and this runs on whatever the row happens to hold.
    expect(parseTopoLines('1:top:M0.1,0.9 Z:%zz')).toEqual([
      { name: '%zz', path: 'M0.1,0.9 Z', routeFk: 1, topType: 'top' },
    ])
  })
})

describe('diffTopoLines', () => {
  it('tells drawn, erased and moved apart', () => {
    const moved = line(2, { path: 'M0.5,0.9 L0.6,0.2 Z' })
    const before = stringifyTopoLines([line(1), line(2), line(4)])
    const after = stringifyTopoLines([line(1), moved, line(3)])

    const diff = diffTopoLines(before, after)

    expect(diff.added).toEqual([line(3)])
    expect(diff.redrawn).toEqual([moved])
    expect(diff.removed).toEqual([line(4)])
  })

  it('ghosts only what the edit touched', () => {
    // Line 1 was left alone, so it has no ghost: the picture would otherwise trace every
    // line on the photo twice and say nothing.
    const before = stringifyTopoLines([line(1), line(2), line(4)])
    const after = stringifyTopoLines([line(1), line(2, { path: 'M0.5,0.9 L0.6,0.2 Z' }), line(3)])

    expect(diffTopoLines(before, after).previous).toEqual([line(2), line(4)])
  })

  it('counts a top that became a topout as a redraw', () => {
    const before = stringifyTopoLines([line(1)])
    const after = stringifyTopoLines([line(1, { topType: 'topout' })])

    expect(diffTopoLines(before, after).redrawn).toEqual([line(1, { topType: 'topout' })])
  })

  it('carries the state the edit left behind, so nothing parses the string twice', () => {
    const moved = line(2, { path: 'M0.5,0.9 L0.6,0.2 Z' })
    const diff = diffTopoLines(stringifyTopoLines([line(1), line(2)]), stringifyTopoLines([line(1), moved, line(3)]))

    expect(diff.current).toEqual([line(1), moved, line(3)])
  })

  it('reads a row that stored no state as no lines', () => {
    expect(diffTopoLines(undefined, undefined)).toEqual({
      added: [],
      current: [],
      previous: [],
      redrawn: [],
      removed: [],
    })
  })
})

describe('parseTopoChange', () => {
  it('round-trips', () => {
    expect(parseTopoChange(stringifyTopoChange({ action: 'photoAdded', topoId: 42 }))).toEqual({
      action: 'photoAdded',
      topoId: 42,
    })
  })

  it('reads a row that names no photo', () => {
    // A reorder is about the strip, so it names no photo and still has something to say.
    expect(parseTopoChange(stringifyTopoChange({ action: 'reordered' }))).toEqual({
      action: 'reordered',
      topoId: undefined,
    })
  })

  // Legacy rows and anything malformed degrade to the vaguer copy rather than throwing
  // inside a feed card.
  it.each(['', 'not json', '{}', '{"action":"nonsense","topoId":1}', '[]'])('reads %j as no change', (value) => {
    expect(parseTopoChange(value)).toBeNull()
  })
})
