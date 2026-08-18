import { sourceHost } from '$lib/entities/file/upload'
import { getGradeBand, type GradeBand } from '$lib/entities/grade/color'
import { diffTopoLines, parseTopoChange, type TopoLineDiff, type TopoLineState } from '$lib/entities/topo/change'
import type { TopoPoint, TopoView } from '$lib/entities/topo/dto'
import { convertPathToPoints } from '$lib/entities/topo/mapper'
import type { MessageKey } from '$lib/i18n/message'
import { parseCoords, type StoredCoords } from '$lib/map/coords'
import { haversineMetres, type Coords } from '$lib/map/map'
import { diffWords } from 'diff'
import { eventEntityKey, lineRef, type EventEntityMap } from './entity'
import type { CardLine } from './line'
import { verbEntry, type VerbField } from './verbs'

/**
 * What one changed column says, decided before any markup touches it.
 *
 * The same contract the card view keeps (see `card.ts`): message keys and raw values come out
 * of here, never resolved copy and never a formatted string. A test can assert that a nudged
 * pin reads `event_changeLocationConfirmed` rather than that it reads "Approximate pin
 * confirmed" in whichever language ran. Formatting is the markup's half, because it is the
 * half that legitimately needs the reader: their locale, their unit preference, their grading
 * scale.
 *
 * Everything here used to live in `EventChanges.svelte`, where the only way to check any of
 * it was to look at it.
 */

/** What the change lines need beyond the rows themselves. */
export interface ChangeContext {
  /** Hydration, for the approach paths a location thumbnail draws. */
  entities?: EventEntityMap
  /** The topo photos those rows changed, keyed by `topos.id`. */
  topos?: ReadonlyMap<number, TopoView>
}

/** Which of the eleven shapes a change line takes. Declared by the catalogue, in `verbs.ts`. */
export type ChangeKind =
  | 'ascentType'
  | 'chips'
  | 'file'
  | 'grade'
  | 'location'
  | 'pair'
  | 'prose'
  | 'rating'
  | 'source'
  | 'tags'
  | 'topo'

/** A pin on a change line's map thumbnail. Structurally a `StaticMapPoint`, declared here so
 *  a pure module does not import from a component; the markup's props check the two agree. */
export interface ChangeMapPoint extends Coords {
  /** A rough pin, drawn dashed the way the real map draws one. */
  estimated?: boolean
  /** `from` is where a pin used to be, `gone` one that has been removed entirely. */
  variant?: 'from' | 'gone' | 'pin'
}

/** One line to draw on a topo change's photo. Structurally a `Topo` line input; see
 *  {@link ChangeMapPoint} for why it is declared rather than imported. */
export interface ChangeTopoLine {
  band: GradeBand | undefined
  /** Where the line used to be: drawn dashed under the state the edit left behind. */
  ghost: boolean
  id: number
  points: TopoPoint[]
  topType: 'top' | 'topout'
}

/**
 * One changed column, ready to render.
 *
 * A union rather than one shape with optional halves: a location's pins cannot exist on a
 * topo line, so the markup narrows on `kind` once and reads fields that are always there.
 * The stored row does not travel with it. Anything the markup needs is on the view, which is
 * what stops a second decoder growing back in the component.
 */
export type ChangeView = ChangeBase &
  (
    | { added: string[]; kind: 'tags'; removed: string[] }
    | {
        added: TopoLineChip[]
        captionKey: MessageKey | undefined
        image: TopoImage | undefined
        kind: 'topo'
        lines: ChangeTopoLine[]
        redrawn: TopoLineChip[]
        removed: TopoLineChip[]
      }
    | { after: number; before: number; kind: 'rating' }
    | { after: SourceSide; before: SourceSide; kind: 'source' }
    | { after: string[]; before: string[]; kind: 'chips' }
    | { after: string | undefined; before: string | undefined; format: PairFormat; kind: 'pair' }
    | { after: string | undefined; before: string | undefined; kind: 'ascentType' }
    | { after: string | undefined; before: string | undefined; kind: 'prose'; segments: ProseSegment[] | undefined }
    | { afterFk: number | undefined; beforeFk: number | undefined; kind: 'grade' }
    | {
        approximate: boolean
        captionKey: MessageKey
        kind: 'location'
        /** How far the pin moved, for the one caption that says so. Raw metres: the markup
         *  formats it, since the unit is the reader's. */
        metres: number | undefined
        paths: Coords[][] | undefined
        points: ChangeMapPoint[]
      }
    | { kind: 'file'; media: MediaWord }
  )

/**
 * Which word a sentence about media uses. `none` covers three cases that all have to read
 * the same way: nothing has synced yet, the file is gone, and a submit that mixed the two,
 * where neither "photo" nor "video" is true of the card.
 */
export type MediaWord = 'none' | 'photo' | 'video'

/** Which formatter a `pair`'s two chips read through. `text` shows the value as stored. */
export type PairFormat = 'date' | 'humidity' | 'role' | 'temperature' | 'text'

/** One run of a prose diff: text that survived the edit, text it added, text it took out. */
export interface ProseSegment {
  kind: 'added' | 'removed' | 'same'
  value: string
}

/** One side of a source change: the host worth crediting, and the URL behind it. */
export interface SourceSide {
  /** `undefined` for a value that is not a followable URL, which then shows as stored. */
  host: string | undefined
  value: string | undefined
}

/** A topo photo as a change line draws it. */
export interface TopoImage {
  height: number | undefined
  path: string
  width: number | undefined
}

/** A route named by a topo chip. Keyed by route rather than by name: two unnamed lines on one
 *  photo are two chips, and an empty name is the markup's placeholder to render. */
export interface TopoLineChip {
  name: string
  routeFk: number
}

/** What every change line carries, whatever its shape. */
interface ChangeBase {
  /** The label, icon and shape its catalogue entry assigns it. */
  field: VerbField
  /**
   * The `{#each}` key.
   *
   * The row's id AND its column, not the id alone. One event now expands to one line per column
   * it moved, and all of those lines carry the same id: keyed on that, a card whose event changed
   * four columns hands Svelte four duplicate keys and takes the page down to the error boundary.
   * The old shape stored a row per column, so the id was unique by construction.
   */
  id: string
  /**
   * Params for {@link VerbField.labelKey}. Only the file label reads `media`; the rest
   * ignore it, the way the headline params already work.
   */
  labelParams: { media: MediaWord }
}

/**
 * The change lines a set of card lines renders, in the order they arrive.
 *
 * A row whose catalogue entry declares no `field` contributes nothing: it carries no old/new
 * pair worth showing, which is a fact about the event rather than about the column (a role
 * change has a pair, a member removal writes the same column and has none).
 */
export function changeViews(rows: readonly CardLine[], ctx: ChangeContext = {}): ChangeView[] {
  return rows.flatMap((line) => {
    const field = verbEntry(line)?.field
    return field == null ? [] : [changeView(line, field, ctx)]
  })
}

/**
 * The word a removal row stored for the file it removed, or `none` for one written before
 * they did. Also the card's headline word for a removal, which is why it lives here rather
 * than in `card.ts`: that module reads this one, never the other way round.
 */
export function storedMedia(value: null | string | undefined): MediaWord {
  return value === 'photo' || value === 'video' ? value : 'none'
}

function changeView(line: CardLine, field: VerbField, ctx: ChangeContext): ChangeView {
  const base: ChangeBase = {
    field,
    id: `${line.id}:${line.columnName ?? ''}`,
    labelParams: { media: storedMedia(line.oldValue) },
  }

  switch (field.kind) {
    // The stored enum member, unresolved: the four types are drawn as the same glyph the route
    // row and the log form draw, and the markup owns that mapping. A value that is no longer a
    // type (a row written before `send` became `redpoint`) has no glyph and falls back to a
    // plain chip there, which is why this is not narrowed to `AscentType` here.
    case 'ascentType':
      return { ...base, after: line.newValue, before: line.oldValue, kind: 'ascentType' }

    case 'chips':
      return { ...base, after: list(line.newValue), before: list(line.oldValue), kind: 'chips' }

    case 'file':
      return { ...base, kind: 'file', media: storedMedia(line.oldValue) }

    case 'grade':
      return {
        ...base,
        afterFk: gradeFk(line.newValue),
        beforeFk: gradeFk(line.oldValue),
        kind: 'grade',
      }

    case 'location':
      return { ...base, ...locationChange(line, field, ctx), kind: 'location' }

    case 'prose':
      return {
        ...base,
        after: line.newValue,
        before: line.oldValue,
        kind: 'prose',
        segments: proseDiff(line.oldValue, line.newValue),
      }

    // Null coerces to zero stars, never to "Not set": an unrated route and a route rated zero
    // are the same thing to a reader, and an empty row of stars says it.
    case 'rating':
      return { ...base, after: Number(line.newValue ?? 0), before: Number(line.oldValue ?? 0), kind: 'rating' }

    case 'source':
      return { ...base, after: sourceSide(line.newValue), before: sourceSide(line.oldValue), kind: 'source' }

    case 'tags': {
      const before = new Set(list(line.oldValue))
      const after = new Set(list(line.newValue))
      return {
        ...base,
        added: [...after].filter((tag) => !before.has(tag)),
        kind: 'tags',
        removed: [...before].filter((tag) => !after.has(tag)),
      }
    }

    case 'topo':
      return { ...base, ...topoChange(line, ctx), kind: 'topo' }

    case 'pair':
      return {
        ...base,
        after: line.newValue,
        before: line.oldValue,
        format: field.format ?? 'text',
        kind: 'pair',
      }
  }
}

/** The photo's lines as they stand, for the four actions that changed the photo rather than
 *  the drawing on it. */
function currentLines(view: TopoView): ChangeTopoLine[] {
  return view.lines.map((line) => ({
    band: getGradeBand(line.gradeFk),
    ghost: false,
    id: line.id,
    points: line.points,
    topType: line.topType === 'topout' ? 'topout' : 'top',
  }))
}

/** A stored grade id, or `undefined` for the rows that cleared the field. */
function gradeFk(value: string | undefined): number | undefined {
  const parsed = value == null || value.length === 0 ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** `tags` and `firstAscensionists` are stored comma-joined in the change's value. */
function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * What a location row moved, and the sentence that says so.
 *
 * The ladder is ordered, not composed. A cleared pin answers first, because the shared caption
 * would otherwise announce a removal as an update. Then the rows written before the writers
 * stored coordinates at all, which are still true and still as vague as they always were.
 *
 * The approach paths are drawn for a pin that is still there and never for one that is gone:
 * the way to a parking spot nobody can park at any more is the way to nowhere.
 */
function locationChange(
  line: CardLine,
  field: VerbField,
  ctx: ChangeContext,
): {
  approximate: boolean
  captionKey: MessageKey
  metres: number | undefined
  paths: Coords[][] | undefined
  points: ChangeMapPoint[]
} {
  const from = parseCoords(line.oldValue)
  const to = parseCoords(line.newValue)
  // A pin can stay put and still be a change: confirming an estimated one rewrites the flag
  // alone, and "Moved 0 m" would be a silly way to say so.
  const moved = from != null && to != null && (from.lat !== to.lat || from.long !== to.long)

  const captionKey: MessageKey =
    field.cleared === true
      ? 'event_changeLocationRemoved'
      : to == null
        ? 'event_changeLocationUpdated'
        : from == null
          ? 'event_changeLocationSet'
          : moved
            ? 'event_changeLocationMoved'
            : 'event_changeLocationConfirmed'

  return {
    // The chip keys on the new side: a pin that stays approximate says so, and one that stops
    // being approximate needs no second line, since the caption already reads "confirmed".
    approximate: to?.estimated === true,
    captionKey,
    metres: moved ? haversineMetres(from, to) : undefined,
    paths: field.cleared === true ? undefined : ctx.entities?.get(eventEntityKey(lineRef(line)))?.paths,
    points: locationPoints(from, to),
  }
}

/** Where it was, where it is, or where it used to be. `estimated` rides along so a guessed pin
 *  is marked here the way it is on the real map. */
function locationPoints(from: null | StoredCoords, to: null | StoredCoords): ChangeMapPoint[] {
  return [
    ...(from == null ? [] : [{ ...from, variant: to == null ? ('gone' as const) : ('from' as const) }]),
    ...(to == null ? [] : [{ ...to, variant: 'pin' as const }]),
  ]
}

/**
 * A description edit as one text: what stayed, what went, what arrived.
 *
 * Word granularity, because that is where an edit to prose actually happens. `undefined` when
 * either side is empty: "Not set" against the text says more than a whole description marked
 * as one long insertion.
 *
 * ponytail: a `!route:501!` reference shows raw rather than as the route's name. Upgrade =
 * resolve references to their names before diffing, which needs the hydration the card already
 * does for its rows.
 */
function proseDiff(before: string | undefined, after: string | undefined): ProseSegment[] | undefined {
  if (before == null || before.length === 0 || after == null || after.length === 0) {
    return undefined
  }

  return diffWords(before, after).map((part) => ({
    kind: part.added === true ? 'added' : part.removed === true ? 'removed' : 'same',
    value: part.value,
  }))
}

/**
 * Both ends of a redraw on one photo: the lines the save left behind, and under them, dashed,
 * the ones it moved or erased.
 *
 * Ghost ids are negated to keep them apart from the live line for the same route, which sits
 * right on top of them. A line whose stored path does not decode is dropped rather than drawn
 * with no points.
 */
function redrawLines(diff: TopoLineDiff, view: TopoView): ChangeTopoLine[] {
  const draw = (states: TopoLineState[], ghost: boolean): ChangeTopoLine[] =>
    states.flatMap((line) => {
      const points = convertPathToPoints(line.path)
      return points.length === 0
        ? []
        : [
            {
              // Off the photo as it stands, which is the only place a grade lives. An erased
              // line falls back to the neutral band, and it is a ghost anyway.
              band: ghost ? undefined : getGradeBand(view.lines.find((l) => l.routeId === line.routeFk)?.gradeFk),
              ghost,
              id: ghost ? -line.routeFk : line.routeFk,
              points,
              topType: line.topType === 'topout' ? ('topout' as const) : ('top' as const),
            },
          ]
    })

  return [...draw(diff.previous, true), ...draw(diff.current, false)]
}

/** The host stands for the URL, since a reader looking at "who reposted this" wants the clip.
 *  A legacy free-text source has no host to reduce to and shows as stored. */
function sourceSide(value: string | undefined): SourceSide {
  return { host: sourceHost(value), value }
}

/** What the topo change was. The four photo actions each say their own thing; a redraw lets the
 *  line chips speak, and only says "Lines updated" when it has no chips to show. */
function topoCaption(action: string, diff: TopoLineDiff): MessageKey | undefined {
  switch (action) {
    case 'photoAdded':
      return 'event_changeTopoPhotoAdded'
    // The same sentence a removed route photo gets: it is the same event to a reader. Always a
    // photo here, since a topo is an image.
    case 'photoRemoved':
      return 'event_changeFileRemoved'
    case 'photoReplaced':
      return 'event_changeTopoPhotoReplaced'
    case 'reordered':
      return 'event_changeTopoReordered'
    default:
      return diff.added.length + diff.redrawn.length + diff.removed.length > 0
        ? undefined
        : 'event_changeTopoLinesUpdated'
  }
}

/**
 * What a topo row changed, and what to draw for it.
 *
 * A row whose `metadata` names no topo change is every one written before the writers said
 * which of the five edits they were: it keeps its vaguest sentence and draws nothing, exactly
 * as it always did.
 *
 * The lines come off the row rather than off the photo as it stands, so a card keeps saying
 * what that edit did however much the topo has moved on since. The chips are decided even
 * when the photo is gone, because "Erased Rampe" is still the story.
 */
function topoChange(
  line: CardLine,
  ctx: ChangeContext,
): {
  added: TopoLineChip[]
  captionKey: MessageKey | undefined
  image: TopoImage | undefined
  lines: ChangeTopoLine[]
  redrawn: TopoLineChip[]
  removed: TopoLineChip[]
} {
  const change = parseTopoChange(line.metadata)

  if (change == null) {
    return {
      added: [],
      captionKey: 'event_changeTopoUpdated',
      image: undefined,
      lines: [],
      redrawn: [],
      removed: [],
    }
  }

  const diff = diffTopoLines(line.oldValue, line.newValue)
  const view = change.topoId == null ? undefined : ctx.topos?.get(change.topoId)
  const chips = (lines: TopoLineState[]) => lines.map(({ name, routeFk }): TopoLineChip => ({ name, routeFk }))

  // A redraw with no stored pair has nothing to say about lines: the photo would be drawn with an
  // empty overlay under "Lines updated", which reads as a wall that was cleared when in fact every
  // line is still on it. Drawing nothing is what the four photo actions already do without a view.
  const blank = change.action === 'lines' && line.oldValue == null && line.newValue == null

  return {
    added: chips(diff.added),
    captionKey: topoCaption(change.action, diff),
    image:
      view == null || blank ? undefined : { height: view.imageHeight, path: view.imagePath, width: view.imageWidth },
    // A redraw draws both of its ends; the four photo actions have no pair to show and draw the
    // photo as it stands. Nothing to draw at all without the photo.
    lines: view == null || blank ? [] : change.action === 'lines' ? redrawLines(diff, view) : currentLines(view),
    redrawn: chips(diff.redrawn),
    removed: chips(diff.removed),
  }
}
