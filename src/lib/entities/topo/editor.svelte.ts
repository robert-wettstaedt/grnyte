import { SvelteMap } from 'svelte/reactivity'
import type { TopoPoint } from './dto'
import { serializePoints } from './path'

/** A route's line while it is being drawn — the editable counterpart of a `topo_routes` row. */
export interface EditLine {
  points: TopoPoint[]
  routeFk: number
  topType: 'top' | 'topout'
}

/** Which kind of point the next surface tap places (undefined = not placing). */
export type PointType = 'middle' | 'start' | 'top'

/** What `saveTopoLines` expects for one line. */
export interface SavedLine {
  path: string
  routeFk: number
  topType: 'top' | 'topout'
}

/** Snap distance as a fraction of the image (all coords are normalized 0-1). */
const SNAP_RADIUS = 0.022
const MAX_STARTS = 2

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())

const cloneLines = (lines: EditLine[]): EditLine[] =>
  lines.map((line) => ({ ...line, points: line.points.map((point) => ({ ...point })) }))

/** Order-independent signature of a topo's line set, for dirty comparison. */
const signature = (lines: EditLine[]): string =>
  [...lines]
    .filter((line) => line.points.length > 0)
    .sort((a, b) => a.routeFk - b.routeFk)
    .map((line) => `${line.routeFk}:${line.topType}:${serializePoints(line.points)}`)
    .join('|')

/**
 * The topo editor's batched dirty session. Line drawing mutates local working docs (one per topo,
 * seeded lazily from the committed lines); undo/redo are local snapshots; Save serializes each dirty
 * doc for `saveTopoLines`; Discard drops the local doc back to committed. Photo/route entity ops are
 * immediate and live outside this controller (see the plan's save model).
 */
export class TopoEditor {
  pointType = $state<PointType | undefined>(undefined)

  /** The point handle the user tapped — its type + a delete action surface in the card. */
  selectedPointId = $state<string | undefined>(undefined)
  selectedRouteFk = $state<number | undefined>(undefined)
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

  #committedFor: (topoId: number) => EditLine[]

  #docs = new SvelteMap<number, EditLine[]>()

  #future = new SvelteMap<number, EditLine[][]>()

  #past = new SvelteMap<number, EditLine[][]>()

  // Pre-gesture snapshot held until the gesture actually mutates, so a no-op tap (select a line,
  // press-release a handle) does not push an undo step or clobber the redo stack.
  #pendingSnapshot: undefined | { lines: EditLine[]; topoId: number }

  // Baseline a topo's doc is compared against for dirtiness. Committed lines lag behind Save by
  // the Zero replication window, so after a successful Save we stamp the saved signature here and
  // dirt is measured against it — the pill/guard clear immediately instead of waiting for the echo.
  #saved = new SvelteMap<number, string>()

  constructor(committedFor: (topoId: number) => EditLine[]) {
    this.#committedFor = committedFor
  }

  /** Add an (empty) line for a route and select it — the target of the next placed points. */
  addLine(routeFk: number): void {
    this.#apply((lines) => {
      if (!lines.some((line) => line.routeFk === routeFk)) {
        lines.push({ points: [], routeFk, topType: 'top' })
      }
    })
    this.selectedRouteFk = routeFk
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

  /** Revert the current topo to its committed lines. */
  discard(): void {
    if (this.topoId != null) this.forget(this.topoId)
    this.pointType = undefined
    this.selectedPointId = undefined
  }

  // --- history ------------------------------------------------------------
  // The stacks always get a NEW array on change: SvelteMap.set skips notifying
  // when the value is reference-equal, so pushing/popping in place would leave
  // canUndo/canRedo stale (a disabled Redo button after every undo).

  /** Revert every topo (used when leaving the editor). */
  discardAll(): void {
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

  /** Move a point during a drag — no undo snapshot (call `beginStroke` at drag start). */
  dragPoint(pointId: string, x: number, y: number): void {
    const [sx, sy] = this.#snap(x, y, pointId)
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
  }

  /** Discard an uncommitted pre-gesture snapshot (gesture ended without mutating). */
  endStroke(): void {
    this.#pendingSnapshot = undefined
  }

  /** Drop a topo's local doc and history, e.g. after its lines are saved or the topo is deleted. */
  forget(topoId: number): void {
    this.#docs.delete(topoId)
    this.#past.delete(topoId)
    this.#future.delete(topoId)
    this.#saved.delete(topoId)
  }

  /** Insert a middle point right after `afterPointId` (the ghost `+` between two points). */
  insertMiddleAfter(afterPointId: string, x: number, y: number): void {
    const [sx, sy] = this.#snap(x, y)
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
    const baseline = this.#saved.get(topoId) ?? signature(this.#committedFor(topoId))
    return signature(doc) !== baseline
  }

  /** Working lines for a topo — the local doc if it has been touched, else the committed set. */
  lines(topoId: number): EditLine[] {
    return this.#docs.get(topoId) ?? this.#committedFor(topoId)
  }

  /** Stamp the just-saved signature as the dirty baseline (called after `saveTopoLines` resolves). */
  markSaved(topoId: number): void {
    this.#saved.set(topoId, signature(this.lines(topoId)))
  }

  /** Move a single point by a normalized delta with no snapping — for keyboard nudges. */
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

  /** Place a point of the armed kind on the current line at (x, y) in normalized 0-1 space. */
  place(x: number, y: number): void {
    if (this.pointType == null || this.selectedRouteFk == null) return
    const [sx, sy] = this.#snap(x, y)
    this.#apply((lines) => {
      const line = lines.find((l) => l.routeFk === this.selectedRouteFk)
      if (line != null) insertByType(line, { id: uid(), type: this.pointType!, x: sx, y: sy })
    })
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
   * Purge a route from every working doc AND every history snapshot — for after the
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
    if (this.selectedRouteFk === routeFk) this.selectedRouteFk = undefined
  }

  /** Serialize a topo's drawn lines for `saveTopoLines` (empty lines are dropped). */
  savedLinesFor(topoId: number): SavedLine[] {
    return this.lines(topoId)
      .filter((line) => line.points.length > 0)
      .map((line) => ({ path: serializePoints(line.points), routeFk: line.routeFk, topType: line.topType }))
  }

  /** Select a point handle (tap) — its type and a delete action surface in the card. */
  selectPoint(pointId: string | undefined): void {
    this.selectedPointId = pointId
    this.pointType = undefined
  }

  // --- point editing ------------------------------------------------------

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

  /** True once the committed lines have caught up to what was saved — safe to drop the local doc. */
  syncedWithCommitted(topoId: number): boolean {
    const saved = this.#saved.get(topoId)
    return saved != null && signature(this.#committedFor(topoId)) === saved
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

  #pushUndo(topoId: number, snapshot: EditLine[] = cloneLines(this.lines(topoId))): void {
    this.#past.set(topoId, [...(this.#past.get(topoId) ?? []), snapshot])
    this.#future.set(topoId, [])
    this.#pendingSnapshot = undefined
  }

  // --- save ---------------------------------------------------------------

  /** Snap to the nearest point of any line within the radius (excluding one being dragged). */
  #snap(x: number, y: number, excludeId?: string): [number, number] {
    let best: TopoPoint | undefined
    let bestDist = SNAP_RADIUS
    for (const line of this.currentLines) {
      for (const point of line.points) {
        if (point.id === excludeId) continue
        const dist = Math.hypot(point.x - x, point.y - y)
        if (dist < bestDist) {
          bestDist = dist
          best = point
        }
      }
    }
    return best == null ? [x, y] : [best.x, best.y]
  }
}

/** Place a new point into a line keeping the invariant [starts…, middles…, top?] and the count caps. */
function insertByType(line: EditLine, point: TopoPoint): void {
  if (point.type === 'start') {
    const starts = line.points.filter((p) => p.type === 'start').length
    if (starts >= MAX_STARTS) return
    line.points.splice(starts, 0, point)
  } else if (point.type === 'top') {
    const index = line.points.findIndex((p) => p.type === 'top')
    if (index >= 0) line.points[index] = point
    else line.points.push(point)
  } else {
    const topIndex = line.points.findIndex((p) => p.type === 'top')
    line.points.splice(topIndex >= 0 ? topIndex : line.points.length, 0, point)
  }
}
