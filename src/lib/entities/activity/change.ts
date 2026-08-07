import { sourceHost } from '$lib/entities/file/upload'
import { getGradeBand, type GradeBand } from '$lib/entities/grade/color'
import { diffTopoLines, parseTopoChange, type TopoLineDiff, type TopoLineState } from '$lib/entities/topo/change'
import type { TopoPoint, TopoView } from '$lib/entities/topo/dto'
import { convertPathToPoints } from '$lib/entities/topo/mapper'
import type { MessageKey } from '$lib/i18n/message'
import { parseCoords, type StoredCoords } from '$lib/map/coords'
import { haversineMetres, type Coords } from '$lib/map/map'
import { diffWords } from 'diff'
import type { ActivityListItem } from './dto'
import { activityEntityKey, type ActivityEntityMap } from './entity'
import { activityEntry, type ActivityField } from './verbs'

/**
 * What one changed column says, decided before any markup touches it.
 *
 * The same contract the card view keeps (see `card.ts`): message keys and raw values come out
 * of here, never resolved copy and never a formatted string. A test can assert that a nudged
 * pin reads `activity_changeLocationConfirmed` rather than that it reads "Approximate pin
 * confirmed" in whichever language ran. Formatting is the markup's half, because it is the
 * half that legitimately needs the reader: their locale, their unit preference, their grading
 * scale.
 *
 * Everything here used to live in `ActivityChanges.svelte`, where the only way to check any of
 * it was to look at it.
 */

/** What the change lines need beyond the rows themselves. */
export interface ActivityChangeContext {
  /** Hydration, for the approach paths a location thumbnail draws. */
  entities?: ActivityEntityMap
  /** The topo photos those rows changed, keyed by `topos.id`. */
  topos?: ReadonlyMap<number, TopoView>
}

/** Which of the ten shapes a change line takes. Declared by the catalogue, in `verbs.ts`. */
export type ActivityChangeKind =
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

/**
 * One changed column, ready to render.
 *
 * A union rather than one shape with optional halves: a location's pins cannot exist on a
 * topo line, so the markup narrows on `kind` once and reads fields that are always there.
 * The stored row does not travel with it. Anything the markup needs is on the view, which is
 * what stops a second decoder growing back in the component.
 */
export type ActivityChangeView = ActivityChangeBase &
  (
    | { added: string[]; kind: 'tags'; removed: string[] }
    | {
        added: TopoLineChip[]
        captionKey: MessageKey | undefined
        image: TopoImage | undefined
        kind: 'topo'
        lines: ActivityTopoLine[]
        redrawn: TopoLineChip[]
        removed: TopoLineChip[]
      }
    | { after: number; before: number; kind: 'rating' }
    | { after: SourceSide; before: SourceSide; kind: 'source' }
    | { after: string[]; before: string[]; kind: 'chips' }
    | { after: string | undefined; before: string | undefined; format: PairFormat; kind: 'pair' }
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
        points: ActivityMapPoint[]
      }
    | { kind: 'file'; media: ActivityMedia }
  )

/** A pin on a change line's map thumbnail. Structurally a `StaticMapPoint`, declared here so
 *  a pure module does not import from a component; the markup's props check the two agree. */
export interface ActivityMapPoint extends Coords {
  /** A rough pin, drawn dashed the way the real map draws one. */
  estimated?: boolean
  /** `from` is where a pin used to be, `gone` one that has been removed entirely. */
  variant?: 'from' | 'gone' | 'pin'
}

/**
 * Which word a sentence about media uses. `none` covers three cases that all have to read
 * the same way: nothing has synced yet, the file is gone, and a submit that mixed the two,
 * where neither "photo" nor "video" is true of the card.
 */
export type ActivityMedia = 'none' | 'photo' | 'video'

/** One line to draw on a topo change's photo. Structurally a `Topo` line input; see
 *  {@link ActivityMapPoint} for why it is declared rather than imported. */
export interface ActivityTopoLine {
  band: GradeBand | undefined
  /** Where the line used to be: drawn dashed under the state the edit left behind. */
  ghost: boolean
  id: number
  points: TopoPoint[]
  topType: 'top' | 'topout'
}

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
interface ActivityChangeBase {
  /** The label, icon and shape its catalogue entry assigns it. */
  field: ActivityField
  /** `activities.id`, which is the `{#each}` key. */
  id: number
  /**
   * Params for {@link ActivityField.labelKey}. Only the file label reads `media`; the rest
   * ignore it, the way the headline params already work.
   */
  labelParams: { media: ActivityMedia }
}

/**
 * The change lines a set of activity rows renders, in the order they arrive.
 *
 * A row whose catalogue entry declares no `field` contributes nothing: it carries no old/new
 * pair worth showing, which is a fact about the event rather than about the column (a role
 * change has a pair, a member removal writes the same column and has none).
 */
export function activityChanges(
  activities: readonly ActivityListItem[],
  ctx: ActivityChangeContext = {},
): ActivityChangeView[] {
  return activities.flatMap((activity) => {
    const field = activityEntry(activity)?.field
    return field == null ? [] : [changeView(activity, field, ctx)]
  })
}

/**
 * The word a removal row stored for the file it removed, or `none` for one written before
 * they did. Also the card's headline word for a removal, which is why it lives here rather
 * than in `card.ts`: that module reads this one, never the other way round.
 */
export function storedMedia(value: null | string | undefined): ActivityMedia {
  return value === 'photo' || value === 'video' ? value : 'none'
}

function changeView(activity: ActivityListItem, field: ActivityField, ctx: ActivityChangeContext): ActivityChangeView {
  const base: ActivityChangeBase = {
    field,
    id: activity.id,
    labelParams: { media: storedMedia(activity.oldValue) },
  }

  switch (field.kind) {
    case 'chips':
      return { ...base, after: list(activity.newValue), before: list(activity.oldValue), kind: 'chips' }

    case 'file':
      return { ...base, kind: 'file', media: storedMedia(activity.oldValue) }

    case 'grade':
      return {
        ...base,
        afterFk: gradeFk(activity.newValue),
        beforeFk: gradeFk(activity.oldValue),
        kind: 'grade',
      }

    case 'location':
      return { ...base, ...locationChange(activity, field, ctx), kind: 'location' }

    case 'prose':
      return {
        ...base,
        after: activity.newValue,
        before: activity.oldValue,
        kind: 'prose',
        segments: proseDiff(activity.oldValue, activity.newValue),
      }

    // Null coerces to zero stars, never to "Not set": an unrated route and a route rated zero
    // are the same thing to a reader, and an empty row of stars says it.
    case 'rating':
      return { ...base, after: Number(activity.newValue ?? 0), before: Number(activity.oldValue ?? 0), kind: 'rating' }

    case 'source':
      return { ...base, after: sourceSide(activity.newValue), before: sourceSide(activity.oldValue), kind: 'source' }

    case 'tags': {
      const before = new Set(list(activity.oldValue))
      const after = new Set(list(activity.newValue))
      return {
        ...base,
        added: [...after].filter((tag) => !before.has(tag)),
        kind: 'tags',
        removed: [...before].filter((tag) => !after.has(tag)),
      }
    }

    case 'topo':
      return { ...base, ...topoChange(activity, ctx), kind: 'topo' }

    case 'pair':
      return {
        ...base,
        after: activity.newValue,
        before: activity.oldValue,
        format: field.format ?? 'text',
        kind: 'pair',
      }
  }
}

/** The photo's lines as they stand, for the four actions that changed the photo rather than
 *  the drawing on it. */
function currentLines(view: TopoView): ActivityTopoLine[] {
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

/** `tags` and `firstAscensionists` are stored comma-joined on the activity row. */
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
  activity: ActivityListItem,
  field: ActivityField,
  ctx: ActivityChangeContext,
): {
  approximate: boolean
  captionKey: MessageKey
  metres: number | undefined
  paths: Coords[][] | undefined
  points: ActivityMapPoint[]
} {
  const from = parseCoords(activity.oldValue)
  const to = parseCoords(activity.newValue)
  // A pin can stay put and still be a change: confirming an estimated one rewrites the flag
  // alone, and "Moved 0 m" would be a silly way to say so.
  const moved = from != null && to != null && (from.lat !== to.lat || from.long !== to.long)

  const captionKey: MessageKey =
    field.cleared === true
      ? 'activity_changeLocationRemoved'
      : to == null
        ? 'activity_changeLocationUpdated'
        : from == null
          ? 'activity_changeLocationSet'
          : moved
            ? 'activity_changeLocationMoved'
            : 'activity_changeLocationConfirmed'

  return {
    // The chip keys on the new side: a pin that stays approximate says so, and one that stops
    // being approximate needs no second line, since the caption already reads "confirmed".
    approximate: to?.estimated === true,
    captionKey,
    metres: moved ? haversineMetres(from, to) : undefined,
    paths:
      field.cleared === true
        ? undefined
        : ctx.entities?.get(activityEntityKey({ id: activity.entityId, type: activity.entityType }))?.paths,
    points: locationPoints(from, to),
  }
}

/** Where it was, where it is, or where it used to be. `estimated` rides along so a guessed pin
 *  is marked here the way it is on the real map. */
function locationPoints(from: null | StoredCoords, to: null | StoredCoords): ActivityMapPoint[] {
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
function redrawLines(diff: TopoLineDiff, view: TopoView): ActivityTopoLine[] {
  const draw = (states: TopoLineState[], ghost: boolean): ActivityTopoLine[] =>
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
      return 'activity_changeTopoPhotoAdded'
    // The same sentence a removed route photo gets: it is the same event to a reader. Always a
    // photo here, since a topo is an image.
    case 'photoRemoved':
      return 'activity_changeFileRemoved'
    case 'photoReplaced':
      return 'activity_changeTopoPhotoReplaced'
    case 'reordered':
      return 'activity_changeTopoReordered'
    default:
      return diff.added.length + diff.redrawn.length + diff.removed.length > 0
        ? undefined
        : 'activity_changeTopoLinesUpdated'
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
  activity: ActivityListItem,
  ctx: ActivityChangeContext,
): {
  added: TopoLineChip[]
  captionKey: MessageKey | undefined
  image: TopoImage | undefined
  lines: ActivityTopoLine[]
  redrawn: TopoLineChip[]
  removed: TopoLineChip[]
} {
  const change = parseTopoChange(activity.metadata)

  if (change == null) {
    return {
      added: [],
      captionKey: 'activity_changeTopoUpdated',
      image: undefined,
      lines: [],
      redrawn: [],
      removed: [],
    }
  }

  const diff = diffTopoLines(activity.oldValue, activity.newValue)
  const view = change.topoId == null ? undefined : ctx.topos?.get(change.topoId)
  const chips = (lines: TopoLineState[]) => lines.map(({ name, routeFk }): TopoLineChip => ({ name, routeFk }))

  return {
    added: chips(diff.added),
    captionKey: topoCaption(change.action, diff),
    image: view == null ? undefined : { height: view.imageHeight, path: view.imagePath, width: view.imageWidth },
    // A redraw draws both of its ends; the four photo actions have no pair to show and draw the
    // photo as it stands. Nothing to draw at all without the photo.
    lines: view == null ? [] : change.action === 'lines' ? redrawLines(diff, view) : currentLines(view),
    redrawn: chips(diff.redrawn),
    removed: chips(diff.removed),
  }
}
