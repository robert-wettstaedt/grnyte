import { SvelteMap } from 'svelte/reactivity'
import type { TopoPoint } from './dto'
import { topoLinesFingerprint } from './fingerprint'
import { serializePoints } from './path'

/** A route's line while it is being drawn: the editable counterpart of a `topo_routes` row. */
export interface EditLine {
  points: TopoPoint[]
  routeFk: number
  topType: 'top' | 'topout'
}

/** What a release at a position would do while armed: place a point, or select one already there. */
export type PlacementIntent =
  { kind: 'place'; snapped: TopoPoint | undefined; x: number; y: number } | { kind: 'select'; point: TopoPoint }

/** Which kind of point the next surface tap places (undefined = not placing). */
export type PointType = 'middle' | 'start' | 'top'

/** What `saveTopoLines` expects for one line. */
export interface SavedLine {
  path: string
  routeFk: number
  topType: 'top' | 'topout'
}

/** Starting snap distance as a fraction of the image; a mounted stage overwrites it per gesture. */
const SNAP_RADIUS = 0.022
const MAX_STARTS = 2

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())

const cloneLines = (lines: EditLine[]): EditLine[] =>
  lines.map((line) => ({ ...line, points: line.points.map((point) => ({ ...point })) }))

/** What a Save replaces: the routes carrying a drawn line. Empty ones are never stored. */
const basisOf = (lines: EditLine[]): string =>
  topoLinesFingerprint(lines.filter((line) => line.points.length > 0).map((line) => line.routeFk))

/** Order-independent signature of a topo's line set, for dirty comparison. */
const signature = (lines: EditLine[]): string =>
  [...lines]
    .filter((line) => line.points.length > 0)
    .sort((a, b) => a.routeFk - b.routeFk)
    .map((line) => `${line.routeFk}:${line.topType}:${serializePoints(dropAdjacentRepeats(line.points))}`)
    .join('|')

/**
 * The topo editor's batched dirty session. Line drawing mutates local working docs (one per topo,
 * seeded lazily from the committed lines); undo/redo are local snapshots; Save serializes each dirty
 * doc for `saveTopoLines`; Discard drops the local doc back to committed. Photo/route entity ops are
 * immediate and live outside this controller (see the plan's save model).
 */
export class TopoEditor {
  pointType = $state<PointType | undefined>(undefined)

  /** The point handle the user tapped: its type + a delete action surface in the card. */
  selectedPointId = $state<string | undefined>(undefined)
  selectedRouteFk = $state<number | undefined>(undefined)

  /**
   * Snap catchment per axis, normalized. The stage sets it per gesture from a screen-px radius, so
   * the catchment is a constant circle on screen rather than shrinking with the photo.
   */
  snapTolerance = $state<{ x: number; y: number }>({ x: SNAP_RADIUS, y: SNAP_RADIUS })

  topoId = $state<number | undefined>(undefined)
  get canRedo(): boolean {
    return this.topoId != null && (this.#future.get(this.topoId)?.length ?? 0) > 0
  }

  get canUndo(): boolean {
    return this.topoId != null && (this.#past.get(this.topoId)?.length ?? 0) > 0
  }
  get currentLine(): EditLine | undefined {
    return this.currentLines.find((line) => line.routeFk === this.selectedRouteFk)
  }
  get currentLines(): EditLine[] {
    return this.topoId == null ? [] : this.lines(this.topoId)
  }
  get dirty(): boolean {
    return this.dirtyTopoIds.length > 0
  }
  get dirtyTopoIds(): number[] {
    return [...this.#docs.keys()].filter((id) => this.isDirty(id))
  }

  get selectedPoint(): TopoPoint | undefined {
    if (this.selectedPointId == null) return undefined
    return this.currentLine?.points.find((point) => point.id === this.selectedPointId)
  }

  /** The committed set at the clone, fingerprinted. Never recomputed: `#committedFor` reads live,
   *  so a fingerprint taken at Save would match its own source every time. */
  #basis = new SvelteMap<number, string>()

  /** `undefined` means "not knowable yet", not "no lines": see the bail in {@link TopoEditor.#apply}. */
  #committedFor: (topoId: number) => EditLine[] | undefined

  #docs = new SvelteMap<number, EditLine[]>()

  #future = new SvelteMap<number, EditLine[][]>()

  #past = new SvelteMap<number, EditLine[][]>()

  // Pre-gesture snapshot held until the gesture mutates, so a no-op tap (select a line,
  // press-release a handle) does not push an undo step or clobber the redo stack.
  #pendingSnapshot: undefined | { lines: EditLine[]; topoId: number }

  // Baseline a topo's doc is compared against for dirtiness. Committed lines lag behind Save by
  // the Zero replication window, so after a successful Save we stamp the saved signature here and
  // dirt is measured against it: the pill/guard clear immediately instead of waiting for the echo.
  #saved = new SvelteMap<number, string>()

  constructor(committedFor: (topoId: number) => EditLine[] | undefined) {
    this.#committedFor = committedFor
  }

  /** Add an (empty) line for a route and select it: the target of the next placed points. */
  addLine(routeFk: number): void {
    this.#apply((lines) => {
      if (!lines.some((line) => line.routeFk === routeFk)) {
        lines.push({ points: [], routeFk, topType: 'top' })
      }
    })
    this.selectedRouteFk = routeFk
  }

  /** What this Save replaces, or `undefined` when the topo was never edited. No fallback to the
   *  live set: that would compute the server's own answer and pass every check. */
  basisFor(topoId: number): string | undefined {
    return this.#basis.get(topoId)
  }

  /** Hold a snapshot for a drag gesture; it becomes an undo step only if the gesture mutates. */
  beginStroke(): void {
    if (this.topoId != null) this.#pendingSnapshot = { lines: cloneLines(this.currentLines), topoId: this.topoId }
  }

  deletePoint(pointId: string): void {
    this.#apply((lines) => {
      for (const line of lines) {
        const index = line.points.findIndex((p) => p.id === pointId)
        if (index >= 0) {
          line.points.splice(index, 1)
          return
        }
      }
    })
    if (this.selectedPointId === pointId) this.selectedPointId = undefined
  }

  // --- history ------------------------------------------------------------
  // The stacks always get a NEW array on change: SvelteMap.set skips notifying
  // when the value is reference-equal, so pushing/popping in place would leave
  // canUndo/canRedo stale (a disabled Redo button after every undo).

  /** Revert the current topo to its committed lines. */
  discard(): void {
    if (this.topoId != null) this.forget(this.topoId)
    this.pointType = undefined
    this.selectedPointId = undefined
  }

  /** Revert every topo (used when leaving the editor). */
  discardAll(): void {
    this.#basis.clear()
    this.#docs.clear()
    this.#past.clear()
    this.#future.clear()
    this.#saved.clear()
    this.#pendingSnapshot = undefined
    this.pointType = undefined
    this.selectedPointId = undefined
  }

  /** Move a whole line by a normalized delta (drag the line, not a single point). */
  dragLine(routeFk: number, dx: number, dy: number): void {
    this.#apply((lines) => {
      const line = lines.find((l) => l.routeFk === routeFk)
      if (line != null) {
        for (const point of line.points) {
          point.x = Math.min(1, Math.max(0, point.x + dx))
          point.y = Math.min(1, Math.max(0, point.y + dy))
        }
      }
    }, false)
  }

  /** Move a point during a drag: no undo snapshot (call `beginStroke` at drag start).
   *  Returns the point it snapped onto, so the stage need not scan again to draw the ring. */
  dragPoint(pointId: string, x: number, y: number): TopoPoint | undefined {
    // Snapping shares a hold BETWEEN lines, so the dragged point's whole line is excluded: two
    // points of one line never sit on the same hold, adjacent (a collapsed segment) or not.
    const own = this.currentLines.find((l) => l.points.some((p) => p.id === pointId))
    const target = this.snapTargetAt(x, y, own?.points.map((p) => p.id) ?? [pointId])
    const sx = target?.x ?? x
    const sy = target?.y ?? y
    this.#apply((lines) => {
      for (const line of lines) {
        const point = line.points.find((p) => p.id === pointId)
        if (point != null) {
          point.x = sx
          point.y = sy
          return
        }
      }
    }, false)
    return target
  }

  /** Discard an uncommitted pre-gesture snapshot (gesture ended without mutating). */
  endStroke(): void {
    this.#pendingSnapshot = undefined
  }

  /** Drop a topo's local doc and history, e.g. after its lines are saved or the topo is deleted. */
  forget(topoId: number): void {
    this.#basis.delete(topoId)
    this.#docs.delete(topoId)
    this.#past.delete(topoId)
    this.#future.delete(topoId)
    this.#saved.delete(topoId)
  }

  /** Whether a topo still has a local working doc (kept until Save's Zero echo lands, or discarded). */
  hasDoc(topoId: number): boolean {
    return this.#docs.has(topoId)
  }

  /** Insert a middle point right after `afterPointId` (the ghost `+` between two points). */
  insertMiddleAfter(afterPointId: string, x: number, y: number): void {
    // Both neighbours are in range from their own midpoint; snapping to either collapses the segment.
    const line = this.currentLines.find((l) => l.points.some((point) => point.id === afterPointId))
    const at = line?.points.findIndex((point) => point.id === afterPointId) ?? -1
    const neighbours =
      line == null || at < 0
        ? []
        : [line.points[at]?.id, line.points[at + 1]?.id].filter((id): id is string => id != null)
    const [sx, sy] = this.#snap(x, y, neighbours)
    this.#apply((lines) => {
      for (const line of lines) {
        const index = line.points.findIndex((p) => p.id === afterPointId)
        if (index >= 0) {
          line.points.splice(index + 1, 0, { id: uid(), type: 'middle', x: sx, y: sy })
          return
        }
      }
    })
  }

  isDirty(topoId: number): boolean {
    const doc = this.#docs.get(topoId)
    if (doc == null) return false
    const baseline = this.#saved.get(topoId) ?? signature(this.#committedFor(topoId) ?? [])
    return signature(doc) !== baseline
  }

  /** Working lines for a topo: the local doc if it has been touched, else the committed set. */
  lines(topoId: number): EditLine[] {
    return this.#docs.get(topoId) ?? this.#committedFor(topoId) ?? []
  }

  /** Stamp the just-saved signature as the dirty baseline (called after `saveTopoLines` resolves). */
  markSaved(topoId: number): void {
    this.#saved.set(topoId, signature(this.lines(topoId)))
    // A second Save in this session replaces what we just sent.
    this.#basis.set(topoId, topoLinesFingerprint(this.savedLinesFor(topoId).map((line) => line.routeFk)))
  }

  /** Move a single point by a normalized delta with no snapping: for keyboard nudges. */
  movePointBy(pointId: string, dx: number, dy: number): void {
    this.#apply((lines) => {
      for (const line of lines) {
        const point = line.points.find((p) => p.id === pointId)
        if (point != null) {
          point.x = Math.min(1, Math.max(0, point.x + dx))
          point.y = Math.min(1, Math.max(0, point.y + dy))
          return
        }
      }
    }, false)
  }

  // --- selection ----------------------------------------------------------

  /** Place a point of the armed kind on the current line at (x, y) in normalized 0-1 space.
   *  Returns what the press resolved to: the caller must not re-derive it, because this resolves
   *  again at commit and a line syncing in mid-gesture can flip the answer under a stale preview. */
  place(x: number, y: number): 'place' | 'select' | undefined {
    const intent = this.placementIntentAt(x, y)
    if (intent == null) return undefined
    if (intent.kind === 'select') {
      this.selectPoint(intent.point.id)
      return 'select'
    }
    const type = this.pointType!
    this.#apply((lines) => {
      const line = lines.find((l) => l.routeFk === this.selectedRouteFk)
      if (line != null) insertByType(line, { id: uid(), type, x: intent.x, y: intent.y })
    })
    return 'place'
  }

  /**
   * What a release at (x, y) would do while armed. Both the stage's preview and {@link place} read
   * it, so what the finger is shown and what commits cannot disagree: previewing with its own rule
   * and then committing those coordinates is how the snap exclusion came to be a no-op through the
   * UI.
   *
   * A point of the current line under the finger selects rather than places: a line never puts two
   * points on one hold. Other lines still place, which is how two routes share a hold.
   */
  placementIntentAt(x: number, y: number): PlacementIntent | undefined {
    if (this.pointType == null || this.selectedRouteFk == null) return undefined
    const own = nearestWithin(this.currentLine?.points ?? [], x, y, this.snapTolerance)
    if (own != null) return { kind: 'select', point: own }
    const snapped = this.snapTargetAt(x, y, this.currentLine?.points.map((point) => point.id) ?? [])
    return { kind: 'place', snapped, x: snapped?.x ?? x, y: snapped?.y ?? y }
  }

  redo(): void {
    const id = this.topoId
    const future = id == null ? undefined : this.#future.get(id)
    if (id == null || future == null || future.length === 0) return
    this.#past.set(id, [...(this.#past.get(id) ?? []), cloneLines(this.lines(id))])
    this.#docs.set(id, future[future.length - 1])
    this.#future.set(id, future.slice(0, -1))
  }

  /** Remove a route's line from the current photo (kept local until Save). */
  removeLine(routeFk: number): void {
    this.#apply((lines) => {
      const index = lines.findIndex((line) => line.routeFk === routeFk)
      if (index >= 0) lines.splice(index, 1)
    })
    if (this.selectedRouteFk === routeFk) this.selectedRouteFk = undefined
  }

  /**
   * Purge a route from every working doc AND every history snapshot: for after the
   * route is deleted server-side, so neither Save nor undo can resurrect a line
   * pointing at a dead routeFk (which would hit the FK constraint).
   */
  removeRouteEverywhere(routeFk: number): void {
    const strip = (lines: EditLine[]): EditLine[] => lines.filter((line) => line.routeFk !== routeFk)
    for (const [id, doc] of this.#docs) {
      this.#docs.set(id, strip(doc))
    }
    for (const [id, stack] of this.#past) {
      this.#past.set(id, stack.map(strip))
    }
    for (const [id, stack] of this.#future) {
      this.#future.set(id, stack.map(strip))
    }
    // The in-flight gesture's snapshot too: `#commitPending` pushes it onto the undo stack as it is,
    // so a route deleted mid-gesture would come back on the next undo.
    if (this.#pendingSnapshot != null) {
      this.#pendingSnapshot = { ...this.#pendingSnapshot, lines: strip(this.#pendingSnapshot.lines) }
    }
    if (this.selectedRouteFk === routeFk) this.selectedRouteFk = undefined
  }

  /** Serialize a topo's drawn lines for `saveTopoLines` (empty lines are dropped). */
  savedLinesFor(topoId: number): SavedLine[] {
    return this.lines(topoId)
      .filter((line) => line.points.length > 0)
      .map((line) => ({
        path: serializePoints(dropAdjacentRepeats(line.points)),
        routeFk: line.routeFk,
        topType: line.topType,
      }))
  }

  // --- point editing ------------------------------------------------------

  /** Select a point handle (tap): its type and a delete action surface in the card. */
  selectPoint(pointId: string | undefined): void {
    this.selectedPointId = pointId
    this.pointType = undefined
  }

  selectRoute(routeFk: number | undefined): void {
    this.selectedRouteFk = routeFk
    this.pointType = undefined
    this.selectedPointId = undefined
  }

  setTopType(topType: 'top' | 'topout'): void {
    this.#apply((lines) => {
      const line = lines.find((l) => l.routeFk === this.selectedRouteFk)
      if (line != null) line.topType = topType
    })
  }

  snapTargetAt(x: number, y: number, excludeIds: readonly string[] = []): TopoPoint | undefined {
    const candidates = this.currentLines
      .flatMap((line) => line.points)
      .filter((point) => !excludeIds.includes(point.id))
    return nearestWithin(candidates, x, y, this.snapTolerance)
  }

  /** True once the committed lines have caught up to what was saved: safe to drop the local doc. */
  syncedWithCommitted(topoId: number): boolean {
    const saved = this.#saved.get(topoId)
    const committed = this.#committedFor(topoId)
    return saved != null && committed != null && signature(committed) === saved
  }

  undo(): void {
    const id = this.topoId
    const past = id == null ? undefined : this.#past.get(id)
    if (id == null || past == null || past.length === 0) return
    this.#future.set(id, [...(this.#future.get(id) ?? []), cloneLines(this.lines(id))])
    this.#docs.set(id, past[past.length - 1])
    this.#past.set(id, past.slice(0, -1))
  }

  /** Mutate the current topo's doc. `snapshot` records an undo step first (skip it mid-gesture). */
  #apply(mutate: (lines: EditLine[]) => void, snapshot = true): void {
    const id = this.topoId
    if (id == null) return
    // Stamp on the first edit, the last moment the committed set is observable. Gated here, not on
    // the markup, because `#apply` is the only clone site (the route card and `keydown.ts` reach it
    // too). `undefined` means not knowable yet, and a basis stamped then is frozen for the session.
    if (!this.#docs.has(id)) {
      const committed = this.#committedFor(id)
      if (committed == null) return
      this.#basis.set(id, basisOf(committed))
    }
    if (snapshot) this.#pushUndo(id)
    else this.#commitPending(id)
    const next = cloneLines(this.lines(id))
    mutate(next)
    this.#docs.set(id, next)
  }

  /** Promote a pending pre-gesture snapshot into an undo step, on the first real mutation. */
  #commitPending(id: number): void {
    const pending = this.#pendingSnapshot
    if (pending != null && pending.topoId === id) {
      this.#pushUndo(id, pending.lines)
    }
  }

  // --- save ---------------------------------------------------------------

  #pushUndo(topoId: number, snapshot: EditLine[] = cloneLines(this.lines(topoId))): void {
    this.#past.set(topoId, [...(this.#past.get(topoId) ?? []), snapshot])
    this.#future.set(topoId, [])
    this.#pendingSnapshot = undefined
  }

  #snap(x: number, y: number, excludeIds: readonly string[] = []): [number, number] {
    const target = this.snapTargetAt(x, y, excludeIds)
    return target == null ? [x, y] : [target.x, target.y]
  }
}

/**
 * Drop a point that sits exactly on the one before it. A zero-length segment gives the renderer's
 * spline a direction of nothing, and the editor's own snap can make one: it exists to SHARE a hold
 * between lines and nothing scoped it to other lines. The snap exclusions above stop the paths we
 * know about; this is the backstop for the ones we do not.
 *
 * A run keeps its most terminal point, top over start over waypoint, so collapsing one never costs
 * the line its `Z`: keeping the FIRST non-waypoint dropped the top when a start came first, leaving
 * a path with no top beside a `topType` that still said topout. A start lost that way is the lesser
 * harm, since the line is degenerate either way once two of its points share a coordinate.
 *
 * Non-adjacent repeats are left alone: returning to a hold you already used is a real move.
 */
const TERMINAL_RANK: Record<TopoPoint['type'], number> = { middle: 0, start: 1, top: 2 }

function dropAdjacentRepeats(points: TopoPoint[]): TopoPoint[] {
  const kept: TopoPoint[] = []
  for (const point of points) {
    const previous = kept[kept.length - 1]
    if (previous != null && previous.x === point.x && previous.y === point.y) {
      if (TERMINAL_RANK[point.type] > TERMINAL_RANK[previous.type]) kept[kept.length - 1] = point
      continue
    }
    kept.push(point)
  }
  return kept
}

/** Place a new point into a line keeping the invariant [starts…, middles…, top?] and the count caps. */
function insertByType(line: EditLine, point: TopoPoint): void {
  if (point.type === 'start' && line.points.filter((p) => p.type === 'start').length >= MAX_STARTS) {
    return
  }
  const at = insertionIndex(line, point.type)
  if (point.type === 'top' && line.points.some((p) => p.type === 'top')) {
    line.points[at] = point
    return
  }
  line.points.splice(at, 0, point)
}

/** Where {@link insertByType} will put a point of this type. */
function insertionIndex(line: EditLine, type: TopoPoint['type']): number {
  if (type === 'start') {
    return line.points.filter((p) => p.type === 'start').length
  }
  const topIndex = line.points.findIndex((p) => p.type === 'top')
  return topIndex >= 0 ? topIndex : line.points.length
}

/** Nearest point inside the catchment. Distance is in tolerance units, so 1 is the edge on both
 *  axes and the catchment is a circle on screen rather than an ellipse. */
function nearestWithin(
  points: readonly TopoPoint[],
  x: number,
  y: number,
  tolerance: { x: number; y: number },
): TopoPoint | undefined {
  if (!(tolerance.x > 0) || !(tolerance.y > 0)) return undefined
  let best: TopoPoint | undefined
  let bestDist = 1
  for (const point of points) {
    const dist = Math.hypot((point.x - x) / tolerance.x, (point.y - y) / tolerance.y)
    if (dist < bestDist) {
      bestDist = dist
      best = point
    }
  }
  return best
}
