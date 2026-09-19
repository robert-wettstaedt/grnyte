import { eventVerb } from '$lib/db/schema'
// @vitest-environment node
/**
 * The catalogue covers what the app writes, checked against the app rather than claimed.
 *
 * `cases.ts` under the old shape was generated once by reading every call that wrote to the
 * activities log, and then drifted, because nothing re-read them. This does: it parses every
 * `insertEvent` and `createUpdateEvent` call in `src/`, collects the `(verb, object type)` pairs
 * they emit and the columns they diff, and fails when one has no card in the catalogue. A new
 * writer therefore cannot ship without a card to review it by.
 *
 * What it deliberately does NOT assert is the line number in a case's `writer`. That would break
 * on any edit above a call and teach everybody to update it blindly; the file is asserted, the
 * line is there for a reader who wants to jump to the source.
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eventLines } from '../line'
import { VERBS as CATALOGUE, verbEntry, WRITTEN_ROWS } from '../verbs'
import { EVENT_CASES } from './index'

/** The nine verbs, off the schema: what a quoted word on a `verb:` line has to be to be one. */
const VERBS = new Set<string>(eventVerb)

/** Every module that could write an event, read as text: this is a source audit, not an import. */
const SOURCES = globSync('src/**/*.{ts,svelte}').filter(
  (path) => !path.includes('/event/') && !path.includes('.test.') && !path.includes('/cases/'),
)

/** One `insertEvent` / `createUpdateEvent` call, as much of it as a literal can tell us. */
interface WriteSite {
  /** The columns a `createUpdateEvent` diffs, which is what its change rows are keyed on. */
  columns: string[]
  file: string
  line: number
  /** `undefined` where the call passes a variable, e.g. the file removal, which logs on whichever
   *  parent the file hung off. Those are covered by a case naming the file instead. */
  objectType: string | undefined
  /**
   * Every verb the call can write, which is more than one where the writer picks with a ternary
   * (the topo endpoint writes `remove` for a pulled photo and `update` for the rest). Reading only
   * the first would let the other ship with no card.
   */
  verbs: string[]
}

/** Every call, with what its literals say. Deliberately regex rather than a parser: the shape
 *  being read is four literal fields, and a parser would be a dependency to keep the same. */
function writeSites(): WriteSite[] {
  const sites: WriteSite[] = []

  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf8')

    for (const match of source.matchAll(/\b(insertEvent|createUpdateEvent)\(\s*\w+,\s*\{/g)) {
      const start = match.index
      const block = source.slice(start, start + 1400)
      // Everything quoted on the `verb:` line, so a ternary contributes both of its arms.
      const verbLine = /verb:\s*([^\n]*)/.exec(block)
      // Filtered against the schema's own list, because a ternary quotes its CONDITION too:
      // `action === 'photoRemoved' ? 'remove' : 'update'` offers three words and two are verbs.
      const verbs =
        verbLine == null
          ? []
          : [...verbLine[1].matchAll(/'(\w+)'/g)].map((entry) => entry[1]).filter((word) => VERBS.has(word))
      const objectType = /object:\s*\{[^}]*type:\s*'(\w+)'/s.exec(block)
      const newEntity = /newEntity:\s*\{([^}]*)\}/s.exec(block)

      sites.push({
        columns: newEntity == null ? [] : [...newEntity[1].matchAll(/(\w+):/g)].map((entry) => entry[1]),
        file,
        line: source.slice(0, start).split('\n').length,
        objectType: objectType?.[1],
        // `createUpdateEvent` defaults to `update`, which is what makes an unstated verb an
        // update rather than a hole.
        verbs: verbs.length > 0 ? verbs : match[1] === 'createUpdateEvent' ? ['update'] : ['?'],
      })
    }
  }

  return sites
}

const SITES = writeSites()

/** What the catalogue exercises: every `(verb, object)` pair its events carry. */
const covered = new Set(
  EVENT_CASES.flatMap((entry) => entry.events.map((event) => `${event.verb}:${event.objectType}`)),
)

/** Every column the catalogue shows a change line for. */
const coveredColumns = new Set(
  EVENT_CASES.flatMap((entry) => entry.events.flatMap((event) => event.changes.map((change) => change.columnName))),
)

/** Every file the catalogue claims to stand for. */
const coveredFiles = new Set(EVENT_CASES.flatMap((entry) => (entry.writer == null ? [] : [entry.writer.split(':')[0]])))

describe('the case catalogue is read off the write path', () => {
  it('finds the write sites at all, so a silent zero cannot pass every assertion below', () => {
    expect(SITES.length).toBeGreaterThan(20)
  })

  it('has a card for every (verb, object) the app writes', () => {
    const missing = [
      ...new Set(
        SITES.filter((site) => site.objectType != null).flatMap((site) =>
          site.verbs
            .filter((verb) => !covered.has(`${verb}:${site.objectType}`))
            .map((verb) => `${verb}:${site.objectType} (${site.file}:${site.line})`),
        ),
      ),
    ]

    expect(missing).toEqual([])
  })

  it('has a change line for every column the app diffs', () => {
    const missing = [
      ...new Set(
        SITES.flatMap((site) =>
          site.columns.filter((column) => !coveredColumns.has(column)).map((column) => `${column} (${site.file})`),
        ),
      ),
    ]

    expect(missing).toEqual([])
  })

  it('has a case naming every file that writes events, including the calls whose object is a variable', () => {
    const missing = [...new Set(SITES.map((site) => site.file.split('/').pop() ?? site.file))].filter(
      (file) => !coveredFiles.has(file),
    )

    expect(missing).toEqual([])
  })

  it('names a real writer on every case that claims one', () => {
    // The reaction and comment cases name `reactions.remote.ts`, which writes no event at all:
    // what they are about is the bar a card carries, whose rows are written there. A file counts
    // as a writer if it writes an event OR a reaction.
    const files = new Set([
      ...SITES.map((site) => site.file.split('/').pop()),
      ...SOURCES.filter((path) => /\b(insert|update)\(reactions\)/.test(readFileSync(path, 'utf8'))).map((path) =>
        path.split('/').pop(),
      ),
    ])
    const wrong = EVENT_CASES.filter((entry) => entry.writer != null && !files.has(entry.writer.split(':')[0])).map(
      (entry) => `${entry.id} -> ${entry.writer}`,
    )

    expect(wrong).toEqual([])
  })

  it('shows every sentence the catalogue holds, so none of them is dead or unreviewed', () => {
    // The other direction of the same question. The assertions above ask whether the app can write
    // something the wall does not show; this asks whether the wall shows everything the app can
    // SAY. An entry nothing reaches is either a sentence no writer can produce any more, or one
    // that ships unreviewed because no card on the wall renders it.
    // On the ENTRY rather than on its message key: several entries share a key (a photo pulled off
    // a route and one pulled off an ascent read the same), so comparing keys would report an entry
    // as covered because a different one happens to say the same thing.
    const shown = new Set(EVENT_CASES.flatMap((entry) => entry.events.flatMap(eventLines)).map(verbEntry))

    // Through `WRITTEN_ROWS`, which is the same entries widened: `VERBS` is `as const`, so its
    // element type is a union whose create and delete members declare no `columnName` at all.
    const unreached = CATALOGUE.filter((entry) => !shown.has(entry)).map((entry) => {
      const written = WRITTEN_ROWS.find((row) => row.key === entry.key && row.verb === entry.verb)
      return `${entry.objectType}:${entry.verb}${written?.columnName == null ? '' : `:${written.columnName}`}`
    })

    expect(unreached).toEqual([])
  })

  it('leaves exactly two lines with no sentence of their own, both of them documented', () => {
    // A line that resolves nothing falls through to "made a change", which is what the catalogue
    // exists to avoid. Two do, and both are cases about that: an ascent create whose ascent does
    // not resolve has no type to scope its sentence by, and `join` is a verb nothing writes any
    // more, kept only by migrated history. Anything else appearing here is a card that lost its
    // sentence.
    const unresolved = EVENT_CASES.flatMap((entry) =>
      entry.events.flatMap(eventLines).flatMap((line) => (verbEntry(line) == null ? [entry.id] : [])),
    )

    expect(unresolved.sort()).toEqual(['ASCENT-01i', 'REGION-09a'])
  })

  it('gives every case a unique id', () => {
    const ids = EVENT_CASES.map((entry) => entry.id)
    expect(ids).toEqual([...new Set(ids)])
  })
})
