export type SimilarKind = 'exact' | 'firstLetterTypo' | 'typo' | 'word'

export interface SimilarMatch {
  id: number
  kind: SimilarKind
  place: SimilarPlace
}

export type SimilarPlace = 'block' | 'region' | 'sector'

/** The slice of a route the matcher reads: `routeMapList`'s slim rows satisfy it. */
export interface SimilarRow {
  areaIds: null | string
  blockFk: null | number
  id: number
  name: null | string
}

const KIND_ORDER: readonly SimilarKind[] = ['exact', 'typo', 'firstLetterTypo', 'word']
const MAX_SUGGESTIONS = 3
const PLACE_ORDER: readonly SimilarPlace[] = ['block', 'sector', 'region']

// Counted per region rather than from a stoplist, because names mix languages.
const UNCOMMON_WORD_LIMIT = 2

const fold = (name: string) =>
  name
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const withoutSpaces = (folded: string) => folded.replace(/ /g, '')

export function similarNames(rows: readonly SimilarRow[], block: { areaFk: number; id: number }) {
  const sectorToken = `^${block.areaFk}$`

  const placeOf = (row: SimilarRow): SimilarPlace => {
    if (row.blockFk === block.id) return 'block'
    return row.areaIds?.split(',').includes(sectorToken) ? 'sector' : 'region'
  }

  const known = rows.map((row) => {
    const folded = fold(row.name ?? '')
    return { compact: withoutSpaces(folded), folded, id: row.id, place: placeOf(row), words: folded.split(' ') }
  })

  const namesWith = new Map<string, number>()
  for (const { words } of known) {
    for (const word of new Set(words)) namesWith.set(word, (namesWith.get(word) ?? 0) + 1)
  }
  const uncommon = (word: string) => (namesWith.get(word) ?? 0) <= UNCOMMON_WORD_LIMIT

  return (name: string): SimilarMatch[] => {
    const folded = fold(name)
    const compact = withoutSpaces(folded)
    if (compact === '') return []

    const words = folded.split(' ')
    const countable = words.filter((word) => word.length >= 3 && !/\d/.test(word) && uncommon(word))
    const startsName = compact.length >= 3 && uncommon(folded)

    const kindOf = (candidate: (typeof known)[number]): SimilarKind | undefined => {
      if (candidate.compact === compact) {
        return compact.length >= 3 || candidate.place === 'block' ? 'exact' : undefined
      }
      const typo = typoKind(words, candidate.words)
      if (typo != null || candidate.place === 'region') return typo

      const shared = countable.some((word) => candidate.words.includes(word))
      return shared || (startsName && candidate.folded.startsWith(folded)) ? 'word' : undefined
    }

    return known
      .flatMap((candidate) => {
        const kind = kindOf(candidate)
        return kind == null ? [] : [{ id: candidate.id, kind, place: candidate.place }]
      })
      .sort(
        (a, b) =>
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          PLACE_ORDER.indexOf(a.place) - PLACE_ORDER.indexOf(b.place) ||
          a.id - b.id,
      )
      .slice(0, MAX_SUGGESTIONS)
  }
}

/** Optimal string alignment: swapping two neighbouring letters is one edit. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

function typoKind(typed: readonly string[], stored: readonly string[]): 'firstLetterTypo' | 'typo' | undefined {
  if (typed.length !== stored.length) return undefined

  let kind: 'firstLetterTypo' | 'typo' = 'typo'
  for (const [i, word] of typed.entries()) {
    const other = stored[i]
    if (word === other) continue
    if (/\d/.test(word) || /\d/.test(other)) return undefined

    const shorter = Math.min(word.length, other.length)
    if (shorter < 4) return undefined
    if (word[0] !== other[0]) {
      if (shorter < 8) return undefined
      kind = 'firstLetterTypo'
    }
    const limit = shorter < 8 ? 1 : 2
    // The distance is never below the length difference, so this skips the matrix for most pairs.
    if (Math.abs(word.length - other.length) > limit || editDistance(word, other) > limit) return undefined
  }
  return kind
}
