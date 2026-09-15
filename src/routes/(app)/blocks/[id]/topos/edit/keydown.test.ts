import type { TopoView } from '$lib/entities/topo/dto'
import { TopoEditor, type EditLine } from '$lib/entities/topo/editor.svelte'
import { describe, expect, it, vi } from 'vitest'
import { topoEditorKeydown } from './keydown'

/** A minimal fake keydown event: the handler only reads these fields. */
function press(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    ctrlKey: false,
    key,
    metaKey: false,
    preventDefault: () => {},
    repeat: false,
    shiftKey: false,
    target: null,
    ...opts,
  } as unknown as KeyboardEvent
}

/** Editor over photo 1 with two drawn lines (route 10 left of route 20), plus a two-photo strip. */
function setup() {
  const line = (routeFk: number, x: number): EditLine => ({
    points: [{ id: `p${routeFk}`, type: 'start', x, y: 0.5 }],
    routeFk,
    topType: 'top',
  })
  const store: Record<number, EditLine[]> = { 1: [line(10, 0.2), line(20, 0.8)], 2: [] }
  const editor = new TopoEditor((id) => store[id] ?? [])
  editor.topoId = 1

  const topos: TopoView[] = [
    { id: 1, imageHeight: 200, imagePath: 'a', imageWidth: 100, lines: [] },
    { id: 2, imageHeight: 200, imagePath: 'b', imageWidth: 100, lines: [] },
  ]
  const onSave = vi.fn()
  const onToggleFullscreen = vi.fn()
  const handler = topoEditorKeydown({ editor, onSave, onToggleFullscreen, topos: () => topos })
  const xOf = (routeFk: number) => editor.currentLines.find((l) => l.routeFk === routeFk)!.points[0].x
  return { editor, handler, onSave, onToggleFullscreen, xOf }
}

describe('topoEditorKeydown', () => {
  it('J/L select the previous/next drawn line, wrapping', () => {
    const { editor, handler } = setup()
    handler(press('l')) // nothing selected -> first (leftmost, route 10)
    expect(editor.selectedRouteFk).toBe(10)
    handler(press('l'))
    expect(editor.selectedRouteFk).toBe(20)
    handler(press('l')) // wrap
    expect(editor.selectedRouteFk).toBe(10)
    handler(press('j')) // prev wraps to the last
    expect(editor.selectedRouteFk).toBe(20)
  })

  it('number keys jump to the photo at that 1-based index', () => {
    const { editor, handler } = setup()
    handler(press('2'))
    expect(editor.topoId).toBe(2)
    handler(press('1'))
    expect(editor.topoId).toBe(1)
    handler(press('3')) // out of range: unchanged
    expect(editor.topoId).toBe(1)
  })

  it('arrow keys nudge the selected line by 10px in image space', () => {
    const { editor, handler, xOf } = setup()
    editor.selectRoute(10)
    handler(press('ArrowRight')) // +10px on a 100px-wide image -> +0.1
    expect(xOf(10)).toBeCloseTo(0.3)
  })

  it('nudges a selected point instead of the line', () => {
    const { editor, handler } = setup()
    editor.selectRoute(20)
    editor.selectPoint('p20')
    handler(press('ArrowUp')) // -10px on a 200px-tall image -> -0.05
    expect(editor.selectedPoint!.y).toBeCloseTo(0.45)
  })

  it('leaves arrow keys to the browser when nothing is selected', () => {
    const { editor, handler, xOf } = setup()
    const preventDefault = vi.fn()

    handler(press('ArrowRight', { preventDefault }))

    expect(xOf(10)).toBeCloseTo(0.2)
    expect(preventDefault).not.toHaveBeenCalled()

    editor.selectRoute(10)
    handler(press('ArrowRight', { preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('F toggles fullscreen but Cmd/Ctrl+F does not', () => {
    const { handler, onToggleFullscreen } = setup()
    handler(press('f'))
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
    handler(press('f', { metaKey: true })) // leaves Cmd+F (find) to the browser
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('saves only on Cmd/Ctrl+S', () => {
    const { handler, onSave } = setup()
    handler(press('s'))
    expect(onSave).not.toHaveBeenCalled()
    handler(press('s', { ctrlKey: true }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes', () => {
    const { editor, handler, xOf } = setup()
    editor.selectRoute(10)
    handler(press('ArrowRight'))
    expect(xOf(10)).toBeCloseTo(0.3)
    handler(press('z', { metaKey: true }))
    expect(xOf(10)).toBeCloseTo(0.2)
    handler(press('z', { metaKey: true, shiftKey: true }))
    expect(xOf(10)).toBeCloseTo(0.3)
  })

  it('Escape clears the line selection', () => {
    const { editor, handler } = setup()
    editor.selectRoute(10)
    handler(press('Escape'))
    expect(editor.selectedRouteFk).toBeUndefined()
  })

  it('stays inert while typing in a field', () => {
    const { editor, handler } = setup()
    const input = document.createElement('input')
    handler(press('l', { target: input }))
    expect(editor.selectedRouteFk).toBeUndefined()
  })
})
