/**
 * How a topo change describes itself on an activity row.
 *
 * Two halves, because a topo change has two kinds of fact to carry:
 *
 * - `oldValue`/`newValue` hold the state the change moved between, which is where every
 *   other change renderer already looks, and the only pair `createUpdateActivity` knows how
 *   to fold (see its merge branch).
 * - `metadata` holds what is not a pair: which photo the change is about, and which of the
 *   five topo mutations wrote the row. Keeping the photo out of the pair is exactly what
 *   lets two saves on one photo fold into A→C while two saves on two photos of the same
 *   block stay two rows.
 *
 * The state holds whole paths rather than a fingerprint of them, so the feed can draw both
 * ends of the change: the lines as the edit left them, with the ones it moved or erased
 * ghosted underneath. A line is ~100 characters, an order less than the descriptions the
 * `prose` renderer already stores twice per row.
 *
 * No imports, like `coords.ts`: the writers are remote functions and the readers are feed
 * components, so this has to stay clean enough for both bundles.
 */

/** Which topo mutation wrote the row. The five are genuinely different events, and the
 *  feed said "Topo redrawn" to all of them until they started naming themselves. */
export type TopoAction = 'lines' | 'photoAdded' | 'photoRemoved' | 'photoReplaced' | 'reordered'

/** What a topo row's `metadata` holds. */
export interface TopoChange {
  action: TopoAction
  /** The `topos` row, so the feed can render the photo the change happened on. Absent for
   *  a reorder, which is about the strip rather than about any one photo in it. */
  topoId?: number
}

/** What a redraw did, keyed by route rather than by name: two unnamed routes on one photo
 *  are two lines, and both may have moved. */
export interface TopoLineDiff {
  added: TopoLineState[]
  /** Every line the photo carried AFTER the edit, moved or not: what a before/after render
   *  draws solid. Here rather than parsed again by the caller, since the diff read the same
   *  string to work out the rest. */
  current: TopoLineState[]
  /**
   * How every line the edit touched looked BEFORE it, moved and erased alike: the ghosts a
   * before/after render draws under the new state. A line the edit left alone is not in
   * here, or the picture would ghost the whole photo.
   */
  previous: TopoLineState[]
  /** Same route, different geometry: moved rather than drawn or erased. The after version,
   *  since that is the one the chips name and the picture draws solid. */
  redrawn: TopoLineState[]
  removed: TopoLineState[]
}

/** One drawn line as the state string holds it. */
export interface TopoLineState {
  name: string
  /** `topo_routes.path`, verbatim, so the feed can draw the line rather than just count it. */
  path: string
  routeFk: number
  topType: string
}

const ACTIONS = new Set<string>(['lines', 'photoAdded', 'photoRemoved', 'photoReplaced', 'reordered'])

/** Entries, and the fields inside one. Neither can occur in a path (`M0.3,0.9 L0.4,0.2 Z`),
 *  and a name is URI-encoded, which escapes both. */
const ENTRY = '|'
const FIELD = ':'

/**
 * What a redraw drew, moved and erased.
 *
 * Both sides come off the same encoder, so an unparseable half (a row from before topo
 * changes stored state) reads as an empty set and the caller falls back to its vaguer copy.
 */
export const diffTopoLines = (
  oldValue: null | string | undefined,
  newValue: null | string | undefined,
): TopoLineDiff => {
  const before = new Map(parseTopoLines(oldValue).map((line) => [line.routeFk, line]))
  const after = new Map(parseTopoLines(newValue).map((line) => [line.routeFk, line]))

  const moved = (line: TopoLineState) => {
    const earlier = before.get(line.routeFk)
    return earlier != null && (earlier.path !== line.path || earlier.topType !== line.topType)
  }

  const redrawn = [...after.values()].filter(moved)
  const removed = [...before.values()].filter((line) => !after.has(line.routeFk))

  return {
    added: [...after.values()].filter((line) => !before.has(line.routeFk)),
    current: [...after.values()],
    previous: [...redrawn.flatMap((line) => before.get(line.routeFk) ?? []), ...removed],
    redrawn,
    removed,
  }
}

/** `null` for anything unparseable, which includes every topo row written before this
 *  module: those carry no metadata and render as vaguely as they always did. */
export const parseTopoChange = (value: null | string | undefined): null | TopoChange => {
  if (value == null || value.length === 0) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed == null || typeof parsed !== 'object') {
      return null
    }

    const { action, topoId } = parsed as Record<string, unknown>
    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      return null
    }

    return { action: action as TopoAction, topoId: typeof topoId === 'number' ? topoId : undefined }
  } catch {
    return null
  }
}

/** The inverse of {@link stringifyTopoLines}. Entries it cannot read are dropped rather
 *  than drawn as a line with no points. */
export const parseTopoLines = (value: null | string | undefined): TopoLineState[] => {
  if (value == null || value.length === 0) {
    return []
  }

  return value.split(ENTRY).flatMap((entry) => {
    // Sliced rather than split: the path sits between the outer fields and is left raw, so
    // it is the one field allowed to hold anything (a future path notation included).
    const afterRoute = entry.indexOf(FIELD)
    const beforeName = entry.lastIndexOf(FIELD)
    const afterTopType = entry.indexOf(FIELD, afterRoute + 1)
    if (afterRoute < 0 || afterTopType < 0 || beforeName <= afterTopType) {
      return []
    }

    const routeFk = Number(entry.slice(0, afterRoute))
    return Number.isInteger(routeFk)
      ? [
          {
            name: decode(entry.slice(beforeName + 1)),
            path: entry.slice(afterTopType + 1, beforeName),
            routeFk,
            topType: entry.slice(afterRoute + 1, afterTopType),
          },
        ]
      : []
  })
}

/** `decodeURIComponent` throws on a stray `%`, and this runs on whatever a row happens to
 *  hold. A name that will not decode is worth less than the card it would take down. */
const decode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Built here rather than by the callers, so the key order (and with it the string two rows
 *  are folded on) cannot differ between one writer and the next. */
export const stringifyTopoChange = ({ action, topoId }: TopoChange): string =>
  JSON.stringify(topoId == null ? { action } : { action, topoId })

/**
 * The set of lines on one photo, as `routeFk:topType:path:name` entries.
 *
 * Sorted by route so the same drawing always encodes the same way: unsorted, it would read
 * as a change every time the query came back in a different order. The name is URI-encoded
 * so a route called "Sit start, left exit" cannot split its own entry; the path is not,
 * because it is worth being able to read one of these rows in psql.
 */
export const stringifyTopoLines = (lines: readonly TopoLineState[]): string =>
  [...lines]
    .sort((a, b) => a.routeFk - b.routeFk)
    .map((line) => [line.routeFk, line.topType, line.path, encodeURIComponent(line.name)].join(FIELD))
    .join(ENTRY)
