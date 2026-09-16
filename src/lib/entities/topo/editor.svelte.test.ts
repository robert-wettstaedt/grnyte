import { describe, expect, it } from 'vitest'
import { TopoEditor, type EditLine } from './editor.svelte'
import { topoLinesFingerprint } from './fingerprint'

/** A fresh editor over an empty topo (id 1), plus its committed store. */
function setup(committed: EditLine[] = []) {
  const store: Record<number, EditLine[]> = { 1: committed }
  const editor = new TopoEditor((id) => store[id] ?? [])
  editor.topoId = 1
  return { editor, store }
}

/** A line with a start and two middles: three undoable placements on one route. */
function threePoints(lastY: number) {
  const { editor } = setup()
  editor.addLine(42)
  editor.pointType = 'start'
  editor.place(0.4, 0.8)
  editor.pointType = 'middle'
  editor.place(0.45, 0.5)
  editor.place(0.46, lastY)
  return editor
}

describe('TopoEditor', () => {
  it('draws a line and serializes it for save', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.9)
    editor.pointType = 'top'
    editor.place(0.5, 0.1)

    expect(editor.savedLinesFor(1)).toEqual([{ path: 'M0.5,0.9 L0.5,0.1 Z', routeFk: 42, topType: 'top' }])
  })

  it('is dirty after an edit and clean after discard', () => {
    const { editor } = setup()
    expect(editor.dirty).toBe(false)
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    expect(editor.dirty).toBe(true)
    editor.discard()
    expect(editor.dirty).toBe(false)
  })

  it('undoes and redoes point placement', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.pointType = 'middle'
    editor.place(0.45, 0.5)
    expect(editor.currentLine?.points).toHaveLength(2)

    editor.undo()
    expect(editor.currentLine?.points).toHaveLength(1)
    editor.redo()
    expect(editor.currentLine?.points).toHaveLength(2)
  })

  it('caps starts at two and the top at one', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.3, 0.9)
    editor.place(0.5, 0.9)
    editor.place(0.7, 0.9) // ignored: third start
    editor.pointType = 'top'
    editor.place(0.5, 0.2)
    editor.place(0.5, 0.1) // replaces the top, not a second one

    const points = editor.currentLine!.points
    expect(points.filter((p) => p.type === 'start')).toHaveLength(2)
    expect(points.filter((p) => p.type === 'top')).toHaveLength(1)
    expect(points.find((p) => p.type === 'top')).toMatchObject({ x: 0.5, y: 0.1 })
  })

  it('keeps the redo stack through a no-op stroke (tap that never mutates)', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.pointType = 'middle'
    editor.place(0.45, 0.5)
    editor.undo()
    expect(editor.canRedo).toBe(true)
    // Press-release with no movement: a snapshot is begun then discarded, redo must survive.
    editor.beginStroke()
    editor.endStroke()
    expect(editor.canRedo).toBe(true)
  })

  it('records exactly one undo step for a multi-move drag gesture', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    const pointId = editor.currentLine!.points[0].id
    editor.beginStroke()
    editor.dragPoint(pointId, 0.6, 0.6)
    editor.dragPoint(pointId, 0.7, 0.7) // same gesture: no extra snapshot
    editor.endStroke()
    // Asserted before the undo as well, or the drag could write anything and this would still pass.
    expect(editor.currentLine?.points[0]).toMatchObject({ x: 0.7, y: 0.7 })
    editor.undo()
    expect(editor.currentLine?.points[0]).toMatchObject({ x: 0.4, y: 0.8 })
  })

  it('drags a point where it was asked, over a distance shorter than the snap radius', () => {
    // The dragged point is excluded from its own snap search. Without that it catches its old
    // position and the drag does nothing.
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)
    const pointId = editor.currentLine!.points[0].id

    editor.beginStroke()
    editor.dragPoint(pointId, 0.505, 0.505)

    expect(editor.currentLine!.points[0]).toMatchObject({ x: 0.505, y: 0.505 })
  })

  it('ignores a middle insert aimed at a point on no line', () => {
    // The guarded branch, which the happy-path test below never reaches: without it the neighbour
    // lookup dereferences a line that was never found.
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)

    editor.insertMiddleAfter('not-a-point', 0.2, 0.2)

    expect(editor.currentLine!.points).toHaveLength(1)
  })

  it('undoes and redoes more than one step, and can undo again after a redo', () => {
    const editor = threePoints(0.4)
    expect(editor.currentLine?.points).toHaveLength(3)

    editor.undo()
    editor.undo()
    expect(editor.currentLine?.points).toHaveLength(1)
    expect(editor.canUndo).toBe(true)

    editor.redo()
    expect(editor.currentLine?.points).toHaveLength(2)
    editor.undo()
    expect(editor.currentLine?.points).toHaveLength(1)
    expect(editor.canRedo).toBe(true)
  })

  it('clears dirt on markSaved and drops the doc once committed catches up', () => {
    const { editor, store } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    expect(editor.isDirty(1)).toBe(true)
    editor.markSaved(1)
    // Dirty clears immediately, without waiting for the Zero echo into `committed`.
    expect(editor.isDirty(1)).toBe(false)
    expect(editor.syncedWithCommitted(1)).toBe(false)
    // Zero echoes the saved lines back: now the doc is safe to forget.
    store[1] = [{ points: [{ id: 'x', type: 'start', x: 0.4, y: 0.8 }], routeFk: 42, topType: 'top' }]
    expect(editor.syncedWithCommitted(1)).toBe(true)
  })

  it('selects a point (clearing place mode) and clears the selection on delete', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    const pointId = editor.currentLine!.points[0].id

    editor.selectPoint(pointId)
    expect(editor.selectedPoint?.id).toBe(pointId)
    expect(editor.pointType).toBeUndefined()

    editor.deletePoint(pointId)
    expect(editor.selectedPoint).toBeUndefined()
    expect(editor.currentLine?.points).toHaveLength(0)
  })

  it('snaps a placed point onto a nearby existing point', () => {
    const { editor } = setup()
    editor.addLine(1)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)
    editor.addLine(2)
    editor.pointType = 'start'
    editor.place(0.505, 0.503) // within the snap radius of route 1's start

    const line2 = editor.currentLines.find((l) => l.routeFk === 2)
    expect(line2?.points[0]).toMatchObject({ x: 0.5, y: 0.5 })
  })

  it('honours a per-axis snap tolerance, so a tall photo still snaps in a circle on screen', () => {
    const { editor } = setup()
    editor.addLine(1)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)

    // A 3:4 photo.
    editor.snapTolerance = { x: 0.02, y: 0.015 }
    editor.addLine(2)
    editor.pointType = 'start'
    // Inside x, outside y: an isotropic radius would have caught this.
    editor.place(0.5, 0.518)
    expect(editor.currentLines.find((l) => l.routeFk === 2)?.points[0]).toMatchObject({ x: 0.5, y: 0.518 })

    editor.addLine(3)
    editor.pointType = 'start'
    editor.place(0.518, 0.5)
    expect(editor.currentLines.find((l) => l.routeFk === 3)?.points[0]).toMatchObject({ x: 0.5, y: 0.5 })
  })

  it('reports the snap target so the stage can show it before the gesture commits', () => {
    const { editor } = setup()
    editor.addLine(1)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)
    const startId = editor.currentLine!.points[0].id

    expect(editor.snapTargetAt(0.505, 0.503)?.id).toBe(startId)
    expect(editor.snapTargetAt(0.9, 0.9)).toBeUndefined()
    // The point being dragged never snaps to itself.
    expect(editor.snapTargetAt(0.5, 0.5, [startId])).toBeUndefined()
  })

  it('inserts a middle without snapping onto the two points it splits', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.6)
    editor.pointType = 'top'
    editor.place(0.5, 0.5)

    // A catchment reaching both neighbours must still leave the middle at the midpoint.
    editor.snapTolerance = { x: 0.08, y: 0.08 }
    const startId = editor.currentLine!.points[0].id
    editor.insertMiddleAfter(startId, 0.5, 0.55)

    const points = editor.currentLine!.points
    expect(points).toHaveLength(3)
    expect(points[1]).toMatchObject({ type: 'middle', x: 0.5, y: 0.55 })
  })

  it('does not snap when the tolerance is zero', () => {
    const { editor } = setup()
    editor.addLine(1)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)

    editor.snapTolerance = { x: 0, y: 0 }
    editor.addLine(2)
    editor.pointType = 'start'
    editor.place(0.5001, 0.5001)
    expect(editor.currentLines.find((l) => l.routeFk === 2)?.points[0]).toMatchObject({ x: 0.5001, y: 0.5001 })
  })

  it('nudges a point by a delta without snapping, clamped to 0-1', () => {
    const { editor } = setup()
    editor.addLine(1)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)
    editor.addLine(2)
    editor.pointType = 'start'
    editor.place(0.6, 0.5)
    const line2 = () => editor.currentLines.find((l) => l.routeFk === 2)!
    const pointId = line2().points[0].id

    // Nudged to within the snap radius of route 1's point: it must land exactly, not snap onto (0.5, 0.5).
    editor.movePointBy(pointId, -0.09, 0)
    expect(line2().points[0].x).toBeCloseTo(0.51)
    expect(line2().points[0].y).toBeCloseTo(0.5)

    // Clamp at the edge.
    editor.movePointBy(pointId, -1, -1)
    expect(line2().points[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('coalesces a held nudge burst into one undo step', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    const pointId = editor.currentLine!.points[0].id

    editor.selectPoint(pointId)
    editor.beginStroke() // the first, non-repeat key press opens the undo step
    editor.movePointBy(pointId, 0.01, 0)
    editor.movePointBy(pointId, 0.01, 0) // auto-repeats: no new undo steps
    editor.movePointBy(pointId, 0.01, 0)
    expect(editor.currentLine!.points[0].x).toBeCloseTo(0.43)

    editor.undo() // one step reverts the whole burst
    expect(editor.currentLine?.points[0]).toMatchObject({ x: 0.4, y: 0.8 })
  })
})

/**
 * The route-deletion purge. A line pointing at a route that no longer exists fails `saveTopoLines`
 * on the foreign key, so it has to leave the working doc, both history stacks and the snapshot an
 * in-flight gesture is holding.
 */
describe('TopoEditor route deletion', () => {
  /** Two drawn lines on topo 1, route 7 second, with the editor left on route 42. */
  function drawTwo() {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.addLine(7)
    editor.pointType = 'start'
    editor.place(0.6, 0.8)
    editor.selectRoute(42)
    return editor
  }

  const pointOf = (editor: TopoEditor, routeFk: number) =>
    editor.currentLines.find((l) => l.routeFk === routeFk)!.points[0]

  it('drops the route from the working doc', () => {
    const editor = drawTwo()

    editor.removeRouteEverywhere(7)

    expect(editor.currentLines.map((l) => l.routeFk)).not.toContain(7)
  })

  it('drops it from the undo stack, checked at every step back', () => {
    const editor = drawTwo()

    editor.removeRouteEverywhere(7)

    // Every snapshot, not just the oldest: the route is only in the recent ones. Bounded, so a
    // history bug fails the test instead of hanging the suite.
    for (let step = 0; editor.canUndo && step < 10; step++) {
      editor.undo()
      expect(editor.currentLines.map((l) => l.routeFk)).not.toContain(7)
    }
    expect(editor.canUndo).toBe(false)
  })

  it('drops it from the redo stack', () => {
    const editor = drawTwo()
    editor.undo()

    editor.removeRouteEverywhere(7)
    editor.redo()

    expect(editor.currentLines.map((l) => l.routeFk)).not.toContain(7)
  })

  it('drops it from an in-flight gesture, without losing that gesture’s undo step', () => {
    const editor = drawTwo()
    editor.pointType = 'middle'
    editor.place(0.5, 0.5) // route 42 now has two points, which is what the gesture must revert to
    const pointId = pointOf(editor, 42).id

    editor.beginStroke()
    editor.removeRouteEverywhere(7)
    editor.dragPoint(pointId, 0.45, 0.85)
    editor.endStroke()
    editor.undo()

    expect(editor.currentLines.map((l) => l.routeFk)).not.toContain(7)
    expect(editor.currentLine?.points).toHaveLength(2)
    expect(pointOf(editor, 42)).toMatchObject({ x: 0.4, y: 0.8 })
  })

  it('clears the selection when the selected route is the one deleted', () => {
    const editor = drawTwo()
    editor.selectRoute(7)

    editor.removeRouteEverywhere(7)

    expect(editor.selectedRouteFk).toBeUndefined()
  })
})

/**
 * The staleness basis, and the one way it can be wrong. `#committedFor` reads live, so a
 * fingerprint taken at Save would match its own source every time and protect nothing, invisibly.
 * Only moving the committed set underneath a dirty editor tells the two apart.
 */
describe('TopoEditor staleness basis', () => {
  /** A drawn line, which is what `savedLinesFor` keeps and the server stores. */
  const line = (routeFk: number): EditLine => ({
    points: [
      { id: `${routeFk}-a`, type: 'start', x: 0.1, y: 0.9 },
      { id: `${routeFk}-b`, type: 'top', x: 0.2, y: 0.1 },
    ],
    routeFk,
    topType: 'top',
  })

  it('has nothing to report for a topo that was never edited', () => {
    // An untouched topo is never in `dirtyTopoIds`, so it is never saved. `undefined` rather than a
    // computed value keeps it that way: were it ever sent, '' would be refused server-side.
    const { editor } = setup([line(1)])

    expect(editor.basisFor(1)).toBeUndefined()
  })

  it('stamps the committed set at the first edit', () => {
    const { editor } = setup([line(1), line(2)])

    editor.addLine(3)

    expect(editor.basisFor(1)).toBe(topoLinesFingerprint([1, 2]))
  })

  it('does NOT follow the committed set once the topo is dirty', () => {
    // Somebody else's line syncs in while this editor holds unsaved work. `lines()` is already
    // frozen to the local doc; the basis has to be too, or Save claims to replace what arrived.
    const { editor, store } = setup([line(1), line(2)])

    editor.addLine(3)
    store[1] = [line(1), line(2), line(4)]

    expect(editor.basisFor(1)).toBe(topoLinesFingerprint([1, 2]))
    expect(editor.basisFor(1)).not.toBe(topoLinesFingerprint([1, 2, 4]))
  })

  it('counts only drawn lines, because an empty one is never stored', () => {
    // `savedLinesFor` drops point-less lines, so the server never sees them and must not be told to
    // expect them. Otherwise a photo carrying one would be refused on every save.
    const { editor } = setup([line(1), { points: [], routeFk: 2, topType: 'top' }])

    editor.addLine(3)

    expect(editor.basisFor(1)).toBe(topoLinesFingerprint([1]))
  })

  it('re-stamps after a save, so a second save in the same session is not refused', () => {
    const { editor } = setup([line(1)])

    editor.addLine(2)
    editor.markSaved(1)

    expect(editor.basisFor(1)).toBe(topoLinesFingerprint(editor.savedLinesFor(1).map((l) => l.routeFk)))
  })

  it('refuses to open a working doc while the committed set is not knowable', () => {
    // `undefined` is "cannot say yet", not "no lines". A basis stamped then is frozen for the
    // session, so every Save would refuse.
    const committed: EditLine[] | undefined = undefined
    const editor = new TopoEditor(() => committed)
    editor.topoId = 1

    editor.addLine(3)

    expect(editor.hasDoc(1)).toBe(false)
    expect(editor.basisFor(1)).toBeUndefined()
    expect(editor.isDirty(1)).toBe(false)
  })

  it('covers the entry points that never touch the editor stage', () => {
    // Why the gate is in `#apply`, not the markup: `keydown.ts` calls `movePointBy` from a
    // top-level `<svelte:window>`, and the route card reaches `#apply` too.
    const committed: EditLine[] | undefined = undefined
    const editor = new TopoEditor(() => committed)
    editor.topoId = 1

    editor.movePointBy('any-point', 0.01, 0)
    editor.setTopType('topout')
    editor.removeLine(1)

    expect(editor.hasDoc(1)).toBe(false)
    expect(editor.basisFor(1)).toBeUndefined()
  })

  it('opens and stamps normally once the committed set becomes knowable', () => {
    // The gate defers the edit, it does not disable it. The stamp is the set that arrived.
    // A holder rather than a reassigned `let`, which `prefer-const` misreads through the closure.
    const source: { lines: EditLine[] | undefined } = { lines: undefined }
    const editor = new TopoEditor(() => source.lines)
    editor.topoId = 1

    editor.addLine(3)
    source.lines = [line(1), line(2)]
    editor.addLine(3)

    expect(editor.hasDoc(1)).toBe(true)
    expect(editor.basisFor(1)).toBe(topoLinesFingerprint([1, 2]))
  })

  it('drops the basis when the working doc is discarded', () => {
    const { editor } = setup([line(1)])

    editor.addLine(2)
    editor.forget(1)

    expect(editor.basisFor(1)).toBeUndefined()
  })
})

describe('TopoEditor history and whole-line edits', () => {
  /** A line with one start point placed, so an edit exists to undo. */
  function drawn() {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    return editor
  }

  it('reports what it can undo and redo as the stacks move', () => {
    const { editor } = setup()
    expect(editor.canUndo).toBe(false)
    expect(editor.canRedo).toBe(false)

    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    expect(editor.canUndo).toBe(true)
    expect(editor.canRedo).toBe(false)

    editor.undo()
    expect(editor.canRedo).toBe(true)

    editor.redo()
    expect(editor.canRedo).toBe(false)
    expect(editor.canUndo).toBe(true)
  })

  it('has nothing to undo or redo without a topo open', () => {
    const { editor } = setup()
    editor.topoId = undefined

    expect(editor.canUndo).toBe(false)
    expect(editor.canRedo).toBe(false)
    // Both are no-ops rather than throws: the HUD buttons exist before a photo is chosen.
    expect(() => {
      editor.undo()
      editor.redo()
    }).not.toThrow()
  })

  it('leaves the document alone when the stack it would pop is empty', () => {
    const editor = drawn()
    const before = editor.savedLinesFor(1)

    editor.redo() // nothing was undone, so nothing to redo
    expect(editor.savedLinesFor(1)).toEqual(before)

    // Counted rather than assumed: the stack is deeper than the placements, so undoing a fixed
    // number of times never reaches the empty case the guard exists for.
    let undone = 0
    while (editor.canUndo) {
      editor.undo()
      undone++
    }

    editor.undo() // past is empty: this must add nothing to redo
    let redone = 0
    while (editor.canRedo) {
      editor.redo()
      redone++
    }

    expect(redone).toBe(undone)
    expect(editor.savedLinesFor(1)).toEqual(before)
  })

  it('redoes the steps in the order they were undone, not in reverse', () => {
    const editor = threePoints(0.3)
    expect(editor.currentLine?.points).toHaveLength(3)

    editor.undo()
    editor.undo()
    expect(editor.currentLine?.points).toHaveLength(1)

    editor.redo()
    expect(editor.currentLine?.points).toHaveLength(2)
    editor.redo()
    expect(editor.currentLine?.points).toHaveLength(3)
    expect(editor.canRedo).toBe(false)
  })

  it('removes a line and clears the selection it was holding', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.addLine(43)
    editor.selectRoute(42)

    editor.removeLine(42)

    expect(editor.savedLinesFor(1).map((saved) => saved.routeFk)).not.toContain(42)
    expect(editor.selectedRouteFk).toBeUndefined()
  })

  it('keeps a selection pointed at a different route when a line is removed', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.addLine(43)
    editor.selectRoute(43)

    editor.removeLine(42)

    expect(editor.selectedRouteFk).toBe(43)
  })

  it('undoes a line removal, which is why it records a step', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)

    editor.removeLine(42)
    expect(editor.currentLines).toHaveLength(0)

    editor.undo()
    expect(editor.currentLines.map((l) => l.routeFk)).toEqual([42])
  })

  it('sets the top type on the selected line and nothing else', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.pointType = 'top'
    editor.place(0.4, 0.2)
    // The other line needs a point of its own: `savedLinesFor` drops an empty one, so without it
    // "nothing else" is unassertable and setting the type on every line reads as a pass.
    editor.addLine(43)
    editor.pointType = 'start'
    editor.place(0.7, 0.8)
    editor.selectRoute(42)

    editor.setTopType('topout')

    const saved = editor.savedLinesFor(1)
    expect(saved.find((line) => line.routeFk === 42)?.topType).toBe('topout')
    expect(saved.find((line) => line.routeFk === 43)?.topType).toBe('top')
  })

  it('discards every topo at once, history included', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.topoId = 2
    editor.addLine(43)

    editor.discardAll()

    expect(editor.hasDoc(1)).toBe(false)
    expect(editor.hasDoc(2)).toBe(false)
    editor.topoId = 1
    expect(editor.canUndo).toBe(false)
    expect(editor.dirtyTopoIds).toEqual([])
  })
})

describe('TopoEditor point placement and dragging', () => {
  it('adds a line once per route, however often the route is armed', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)

    editor.addLine(42) // same route again: must not wipe the line by re-adding it

    expect(editor.currentLines.filter((l) => l.routeFk === 42)).toHaveLength(1)
    expect(editor.currentLine?.points).toHaveLength(1)
  })

  it('places nothing without a point type armed, or without a route selected', () => {
    const { editor } = setup()
    editor.addLine(42)

    editor.place(0.4, 0.8) // pointType never set
    expect(editor.currentLine?.points ?? []).toHaveLength(0)

    // Armed with no route selected. The point going nowhere shows nothing (the inner `find` misses
    // either way); the undo step `#apply` records first is what the route half prevents.
    const { editor: armed } = setup()
    armed.pointType = 'start'
    armed.place(0.4, 0.8)

    expect(armed.currentLines.flatMap((line) => line.points)).toHaveLength(0)
    expect(armed.canUndo).toBe(false)
  })

  it('keeps a middle below the top, so the path stays start-to-top', () => {
    // `insertByType`'s invariant. A middle placed after the top must land before it, or the
    // rendered path doubles back on itself.
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.9)
    editor.pointType = 'top'
    editor.place(0.5, 0.1)
    editor.pointType = 'middle'
    editor.place(0.5, 0.5)

    expect(editor.currentLine!.points.map((point) => point.type)).toEqual(['start', 'middle', 'top'])
  })

  it('drags a whole line on both axes and clamps it inside the photo', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)
    editor.pointType = 'top'
    editor.place(0.6, 0.4)

    editor.beginStroke()
    editor.dragLine(42, 0.1, -0.2)

    // Both axes asserted: a mutant dropping either one moves the line on the other and passes.
    const [head, tail] = editor.currentLine!.points
    expect(head.x).toBeCloseTo(0.6)
    expect(head.y).toBeCloseTo(0.3)
    expect(tail.x).toBeCloseTo(0.7)
    expect(tail.y).toBeCloseTo(0.2)

    // Past each edge in turn: both bounds clamp, on both axes.
    editor.dragLine(42, 5, -5)
    expect(editor.currentLine!.points).toMatchObject([
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ])

    editor.dragLine(42, -5, 5)
    expect(editor.currentLine!.points).toMatchObject([
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ])
  })

  // Pins the behaviour, not the early return: with a zero axis the distance is already Infinity or
  // NaN, so deleting that guard changes no output.
  it('offers no snap target when either axis of the tolerance is zero', () => {
    const { editor } = setup()
    editor.addLine(1)
    editor.pointType = 'start'
    editor.place(0.5, 0.5)

    editor.snapTolerance = { x: 0, y: 0.02 }
    expect(editor.snapTargetAt(0.502, 0.502)).toBeUndefined()

    editor.snapTolerance = { x: 0.02, y: 0 }
    expect(editor.snapTargetAt(0.502, 0.502)).toBeUndefined()

    editor.snapTolerance = { x: 0.02, y: 0.02 }
    expect(editor.snapTargetAt(0.502, 0.502)).toBeDefined()
  })

  it('clears the selection only when the deleted point was the selected one', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.4, 0.8)
    editor.place(0.6, 0.8)
    const [first, second] = editor.currentLine!.points

    editor.selectPoint(second.id)
    editor.deletePoint(first.id)

    expect(editor.selectedPointId).toBe(second.id)
    expect(editor.currentLine!.points).toHaveLength(1)
  })
})
