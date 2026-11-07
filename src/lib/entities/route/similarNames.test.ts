import { describe, expect, it } from 'vitest'
import { similarNames, type SimilarRow } from './similarNames'

const block = { areaFk: 10, id: 1 }

const here = (id: number, name: string): SimilarRow => ({ areaIds: '^10$', blockFk: 1, id, name })
const elsewhere = (id: number, name: string): SimilarRow => ({ areaIds: '^20$', blockFk: 2, id, name })

describe('exact matches', () => {
  it('finds a route of the same name on this block', () => {
    const match = similarNames([here(7, 'Karma')], block)

    expect(match('Karma')).toEqual([{ id: 7, kind: 'exact', place: 'block' }])
  })

  it.each([
    ['case', 'karma', 'Karma'],
    ['accents', 'el camaleon', 'El camaleón'],
    ['sharp s', 'Barfuss auf Scherben', 'Barfuß auf Scherben'],
    ['punctuation', 'Uboot', 'U-Boot'],
    ['spacing', 'Hauruck', 'Hau Ruck'],
    ['surrounding space', '  Karma ', 'Karma'],
  ])('ignores %s', (_label, typed, stored) => {
    expect(similarNames([elsewhere(7, stored)], block)(typed)).toEqual([{ id: 7, kind: 'exact', place: 'region' }])
  })

  it('finds nothing for a name with no letters or digits', () => {
    expect(similarNames([here(7, '°')], block)('°')).toEqual([])
    expect(similarNames([here(7, 'Karma')], block)('')).toEqual([])
  })

  it('never matches an unnamed route', () => {
    const unnamed: SimilarRow = { areaIds: '^10$', blockFk: 1, id: 7, name: null }

    expect(similarNames([unnamed], block)('')).toEqual([])
    expect(similarNames([unnamed], block)('Karma')).toEqual([])
  })

  it('places a route with no area chain in the region', () => {
    const noChain: SimilarRow = { areaIds: null, blockFk: 3, id: 7, name: 'Karma' }

    expect(similarNames([noChain], block)('Karma')).toEqual([{ id: 7, kind: 'exact', place: 'region' }])
  })

  it('places a route in the sector from its area chain, on an exact token', () => {
    const inSector: SimilarRow = { areaIds: '^5$,^10$', blockFk: 3, id: 7, name: 'Karma' }
    const lookalike: SimilarRow = { areaIds: '^5$,^100$', blockFk: 4, id: 8, name: 'Karma' }

    expect(similarNames([inSector, lookalike], block)('Karma')).toEqual([
      { id: 7, kind: 'exact', place: 'sector' },
      { id: 8, kind: 'exact', place: 'region' },
    ])
  })
})

describe('typo matches across the region', () => {
  it.each([
    ['Wanfred', 'Wahnfred'],
    ['Zeke', 'Zecke'],
    ['Reibungsmäuschen', 'Reibunsmäuschen'],
    ['Fanfare', 'Farnfare'],
    ['Pressknödel', 'Pressknedl'],
    ['Einsiedlr', 'Einsiedler'],
    ['Einseidler', 'Einsiedler'],
    ['Mensch Achm', 'Mensch Achim'],
    ['Sloper Attack', 'Slooper Attack'],
    ['Münchhausen', 'Muenchhausen'],
    ['Muenchhausen', 'Münchhausen'],
    ['Harzer Kaese', 'Harzer Käse'],
    ['Fieberwan', 'Fieberwahn'],
    ['Globetroter', 'Globetrotter'],
    ['Sonnenuntergnag', 'Sonnenuntergang'],
    ['Gartenzwreg', 'Gartenzwerg'],
    ['Highbal', 'Highball'],
  ])('matches %s and %s', (typed, stored) => {
    expect(similarNames([elsewhere(7, stored)], block)(typed)).toEqual([{ id: 7, kind: 'typo', place: 'region' }])
  })

  // Real-word neighbours one edit apart: only the row's context separates these, so they stay matches.
  it.each([
    ['Bell', 'Ball'],
    ['Kante', 'Kanne'],
    ['Sloper', 'Slope'],
    ['Friction', 'Fraction'],
  ])('accepts %s and %s as the known cost of typo tolerance', (typed, stored) => {
    expect(similarNames([elsewhere(7, stored)], block)(typed)).toHaveLength(1)
  })

  it.each([
    ['Problem 1', 'Problem 2'],
    ['Fixture route 1', 'Fixture route 2'],
    ['Wahnfred', 'Wahnfred 2'],
    ['Left Exit', 'Right Exit'],
    ['Left Hand', 'Right Hand'],
    ['Right of 5', 'Left of 5'],
    ['The Wall', 'The Ball'],
    ['The Gap', 'The Cap'],
    ['The Rib', 'The Gap'],
    ['The Rib', 'The Rig'],
    ['Bell', 'Tell'],
    ['Hecke', 'Zecke'],
    ['Koi', 'Kai'],
    ['Lot', 'Lit'],
    ['Bug', 'Bog'],
    ['Links', 'Finks'],
    ['Hopper', 'Topper'],
    ['Mantel', 'Mantelito'],
    ['Siedler', 'Einsiedler'],
    ['Clan', 'Plan'],
  ])('keeps %s and %s apart', (typed, stored) => {
    expect(similarNames([elsewhere(7, stored)], block)(typed)).toEqual([])
  })

  it('allows one edit on a word of 7 characters and two from 8', () => {
    expect(similarNames([elsewhere(7, 'Abcdefg')], block)('Abxyefg')).toEqual([])
    expect(similarNames([elsewhere(7, 'Abcdefgh')], block)('Abxyefgh')).toEqual([
      { id: 7, kind: 'typo', place: 'region' },
    ])
  })

  it('allows no edit on a word of 3 characters and one on a word of 4', () => {
    expect(similarNames([elsewhere(7, 'Abc')], block)('Abx')).toEqual([])
    expect(similarNames([elsewhere(7, 'Abcd')], block)('Abxd')).toEqual([{ id: 7, kind: 'typo', place: 'region' }])
  })

  it('counts a different first letter only from 8 characters', () => {
    expect(similarNames([elsewhere(7, 'Winterreise')], block)('Vinterreise')).toEqual([
      { id: 7, kind: 'firstLetterTypo', place: 'region' },
    ])
    expect(similarNames([elsewhere(7, 'Abcdefgh')], block)('Xbcdefgh')).toEqual([
      { id: 7, kind: 'firstLetterTypo', place: 'region' },
    ])
    expect(similarNames([elsewhere(7, 'Abcdefg')], block)('Xbcdefg')).toEqual([])
  })
})

describe('edit counting', () => {
  const typo = [{ id: 7, kind: 'typo', place: 'region' }]

  it('counts one swap of neighbouring letters as one edit', () => {
    expect(similarNames([elsewhere(7, 'Zecke')], block)('Zekce')).toEqual(typo)
  })

  it('counts two swaps as two edits', () => {
    expect(similarNames([elsewhere(7, 'Abcdef')], block)('Acbdfe')).toEqual([])
  })

  it('counts a swap only when both letters cross', () => {
    expect(similarNames([elsewhere(7, 'Abxcef')], block)('Abcdef')).toEqual([])
    expect(similarNames([elsewhere(7, 'Abcdef')], block)('Abxcef')).toEqual([])
  })

  it('counts every extra leading letter', () => {
    expect(similarNames([elsewhere(7, 'Xyzabcdefgh')], block)('Abcdefgh')).toEqual([])
  })

  it('sets the allowance from the shorter word', () => {
    expect(similarNames([elsewhere(7, 'Abcdefgh')], block)('Abxdefg')).toEqual([])
    expect(similarNames([elsewhere(7, 'Kois')], block)('Koi')).toEqual([])
    expect(similarNames([elsewhere(7, 'Abcdefgh')], block)('Xbcdefg')).toEqual([])
  })

  it('refuses a typo in a word holding a digit, on either side', () => {
    expect(similarNames([elsewhere(7, 'Karma13')], block)('Karma12')).toEqual([])
    expect(similarNames([elsewhere(7, 'Karmas')], block)('Karma1')).toEqual([])
    expect(similarNames([elsewhere(7, 'Karma1')], block)('Karmas')).toEqual([])
  })

  it('lets short and numbered words pass when they are identical', () => {
    expect(similarNames([elsewhere(7, 'The Wall')], block)('The Wal')).toEqual([])
    expect(similarNames([elsewhere(7, 'The Traverse')], block)('The Travers')).toEqual(typo)
    expect(similarNames([elsewhere(7, 'Traverse 12')], block)('Travers 12')).toEqual(typo)
  })

  it('compares words regardless of the space around them', () => {
    expect(similarNames([elsewhere(7, 'Wahnfred')], block)(' Wanfred ')).toEqual(typo)
    expect(similarNames([elsewhere(7, 'Mensch Achim')], block)('Mensch  - Achm')).toEqual(typo)
  })

  it('keeps a typo a typo on this block', () => {
    expect(similarNames([here(7, 'Wahnfred')], block)('Wanfred')).toEqual([{ id: 7, kind: 'typo', place: 'block' }])
  })
})

describe('nearby routes', () => {
  const inSector = (id: number, name: string): SimilarRow => ({ areaIds: '^5$,^10$', blockFk: 3, id, name })

  it('counts a shared word of exactly 3 characters', () => {
    expect(similarNames([here(7, 'Koi links')], block)('Koi rechts')).toEqual([{ id: 7, kind: 'word', place: 'block' }])
  })

  it('matches the start of a name past a common first word', () => {
    const rows = [here(7, 'The Crack'), here(8, 'The Ramp'), here(9, 'The Rib')]

    expect(similarNames(rows, block)('The Cr')).toEqual([{ id: 7, kind: 'word', place: 'block' }])
  })

  it('matches a shared uncommon word on the block and in the sector, not further away', () => {
    expect(similarNames([here(7, 'Zecke links')], block)('Zecke')).toEqual([{ id: 7, kind: 'word', place: 'block' }])
    expect(similarNames([inSector(7, 'Zecke links')], block)('Zecke')).toEqual([
      { id: 7, kind: 'word', place: 'sector' },
    ])
    expect(similarNames([elsewhere(7, 'Zecke links')], block)('Zecke')).toEqual([])
  })

  it('matches the start of a name from 3 characters', () => {
    expect(similarNames([here(7, 'Zecke')], block)('Zec')).toEqual([{ id: 7, kind: 'word', place: 'block' }])
    expect(similarNames([here(7, 'Zecke')], block)('Ze')).toEqual([])
    expect(similarNames([elsewhere(7, 'Zecke')], block)('Zec')).toEqual([])
  })

  it('does not match text inside a word', () => {
    expect(similarNames([here(7, 'Fieberwahn')], block)('wahn')).toEqual([])
  })

  it('counts a word in 2 names of the region and not in 3', () => {
    const two = [here(7, 'Direct Finish'), elsewhere(8, 'Prow Direct')]
    expect(similarNames(two, block)('Direct Start')).toEqual([{ id: 7, kind: 'word', place: 'block' }])

    const three = [...two, elsewhere(9, 'Slab Direct')]
    expect(similarNames(three, block)('Direct Start')).toEqual([])
  })

  it('does not treat a common word as the start of a name', () => {
    const rows = [here(7, 'The Wall'), here(8, 'The Ramp'), here(9, 'The Rib')]

    expect(similarNames(rows, block)('The')).toEqual([])
    expect(similarNames(rows, block)('The Corner')).toEqual([])
  })

  it('ignores shared words under 3 characters or holding a digit', () => {
    expect(similarNames([here(7, 'El Punter')], block)('El Juglar')).toEqual([])
    expect(similarNames([here(7, 'Route v2x')], block)('Other v2x')).toEqual([])
  })

  it('keeps a numbered sibling nearby through its shared word', () => {
    expect(similarNames([here(7, 'Wahnfred')], block)('Wahnfred 2')).toEqual([{ id: 7, kind: 'word', place: 'block' }])
  })
})

describe('ranking', () => {
  it('orders exact, typo, first-letter typo, then shared word', () => {
    const rows = [
      here(1, 'Winterreise Links'),
      here(2, 'Winterreise'),
      elsewhere(3, 'Vinterreise'),
      elsewhere(4, 'Winterreize'),
    ]

    expect(similarNames(rows, block)('Winterreise').map(({ id, kind }) => [id, kind])).toEqual([
      [2, 'exact'],
      [4, 'typo'],
      [3, 'firstLetterTypo'],
    ])
    expect(similarNames([rows[0], rows[2], rows[3]], block)('Winterreise').map(({ id }) => id)).toEqual([4, 3, 1])
  })

  it('orders one kind by block, then sector, then region', () => {
    const rows: SimilarRow[] = [
      elsewhere(1, 'Karma'),
      { areaIds: '^10$', blockFk: 3, id: 2, name: 'Karma' },
      here(3, 'Karma'),
    ]

    expect(similarNames(rows, block)('Karma').map(({ id }) => id)).toEqual([3, 2, 1])
  })

  it('keeps the three most likely', () => {
    const rows = [elsewhere(1, 'Karma'), here(2, 'Karma'), elsewhere(3, 'Karrma'), here(4, 'Karma'), here(5, 'Karma')]

    expect(similarNames(rows, block)('Karma').map(({ id }) => id)).toEqual([2, 4, 5])
  })

  it('breaks a tie by id, whatever order the rows arrive in', () => {
    const rows = [here(9, 'Karma'), here(4, 'Karma')]

    expect(similarNames(rows, block)('Karma').map(({ id }) => id)).toEqual([4, 9])
  })
})

describe('very short names', () => {
  it('match exactly on this block only', () => {
    expect(similarNames([here(7, 'A')], block)('A')).toEqual([{ id: 7, kind: 'exact', place: 'block' }])
    expect(similarNames([here(7, '10')], block)('10')).toEqual([{ id: 7, kind: 'exact', place: 'block' }])
    expect(similarNames([{ areaIds: '^10$', blockFk: 3, id: 7, name: 'A' }], block)('A')).toEqual([])
    expect(similarNames([elsewhere(7, 'A')], block)('A')).toEqual([])
  })

  it('keeps an exact 3 character name across the region', () => {
    expect(similarNames([elsewhere(7, 'Koi')], block)('Koi')).toEqual([{ id: 7, kind: 'exact', place: 'region' }])
  })
})
