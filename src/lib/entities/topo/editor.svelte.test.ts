import { describe, expect, it } from 'vitest'
import { TopoEditor, type EditLine } from './editor.svelte'

/** A fresh editor over an empty topo (id 1), plus its committed store. */
function setup(committed: EditLine[] = []) {
  const store: Record<number, EditLine[]> = { 1: committed }
  const editor = new TopoEditor((id) => store[id] ?? [])
  editor.topoId = 1
  return { editor, store }
}

describe('TopoEditor', () => {
  it('draws a line and serializes it for save', () => {
    const { editor } = setup()
    editor.addLine(42)
    editor.pointType = 'start'
    editor.place(0.5, 0.9)
    editor.pointType = 'top'
    editor.place(0.5, 0.1)

    expect(editor.savedLinesFor(1)).toEqual([{ routeFk: 42, topType: 'top', path: 'M0.5,0.9 L0.5,0.1 Z' }])
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
    editor.undo()
    expect(editor.currentLine?.points[0]).toMatchObject({ x: 0.4, y: 0.8 })
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
    store[1] = [{ routeFk: 42, topType: 'top', points: [{ id: 'x', type: 'start', x: 0.4, y: 0.8 }] }]
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

    // Nudged to within the snap radius of route 1's point — it must land exactly, not snap onto (0.5, 0.5).
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
