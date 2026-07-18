import { zoomIdentity } from 'd3'
import { expect, test } from 'vitest'
import { overscrollConstrain } from './panzoom'

// 1000x1000 viewport, content filling it (translateExtent == viewport).
const extent: [[number, number], [number, number]] = [
  [0, 0],
  [1000, 1000],
]
const content = extent

test('locked at fit (k=1): no overscroll', () => {
  const t = zoomIdentity.translate(300, 0).scale(1)
  expect(overscrollConstrain(t, extent, content).x).toBe(0)
})

test('zoomed: a corner can be dragged to screen centre', () => {
  // At k=2, tx=500 puts the content's left edge at the viewport centre.
  const t = zoomIdentity.translate(500, 0).scale(2)
  expect(overscrollConstrain(t, extent, content).x).toBe(500)
})

test('zoomed: panning past centre is clamped back', () => {
  const t = zoomIdentity.translate(600, 0).scale(2)
  expect(overscrollConstrain(t, extent, content).x).toBe(500)
})

test('overscroll flag: fit (k=1) can pan a corner to centre and clamps past it', () => {
  // At k=1 the content exactly fills the viewport; tx=500 puts its left edge at centre.
  expect(overscrollConstrain(zoomIdentity.translate(500, 0), extent, content, true).x).toBe(500)
  expect(overscrollConstrain(zoomIdentity.translate(600, 0), extent, content, true).x).toBe(500)
})

test('overscroll flag: works when zoomed out (k=0.5)', () => {
  const atCentre = zoomIdentity.translate(500, 0).scale(0.5)
  const past = zoomIdentity.translate(600, 0).scale(0.5)
  expect(overscrollConstrain(atCentre, extent, content, true).x).toBe(500)
  expect(overscrollConstrain(past, extent, content, true).x).toBe(500)
})

test('without overscroll, a zoomed-out view stays centred (no pan)', () => {
  const t = zoomIdentity.translate(0, 0).scale(0.5)
  // Default constrain re-centres content smaller than the viewport, whatever the offset.
  expect(overscrollConstrain(t, extent, content).x).toBe(250)
})
