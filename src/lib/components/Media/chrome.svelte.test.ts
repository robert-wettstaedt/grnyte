import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { createMediaChrome } from './chrome.svelte'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('hides 3 seconds after playback starts', () => {
  const chrome = createMediaChrome()
  chrome.reset('timed')
  chrome.setPlaying(true)

  vi.advanceTimersByTime(2999)
  expect(chrome.visible).toBe(true)

  vi.advanceTimersByTime(1)
  expect(chrome.visible).toBe(false)
})

const playingChrome = () => {
  const chrome = createMediaChrome()
  chrome.reset('timed')
  chrome.setPlaying(true)
  return chrome
}

it('does not auto-hide while paused', () => {
  const chrome = playingChrome()
  chrome.setPlaying(false)

  vi.advanceTimersByTime(60_000)

  expect(chrome.visible).toBe(true)
})

it('gives interaction another 3 seconds', () => {
  const chrome = playingChrome()
  vi.advanceTimersByTime(2000)

  chrome.reveal()
  vi.advanceTimersByTime(2999)

  expect(chrome.visible).toBe(true)
})

it('hides on a tap only after the cancel window', () => {
  const chrome = playingChrome()

  chrome.tap()
  vi.advanceTimersByTime(249)
  expect(chrome.visible).toBe(true)

  vi.advanceTimersByTime(1)
  expect(chrome.visible).toBe(false)
})

it('keeps the controls up through a double-tap', () => {
  const chrome = playingChrome()

  chrome.tap()
  vi.advanceTimersByTime(100)
  chrome.tap()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it('keeps the controls up when the second tap of a double-tap zooms instead of clicking', () => {
  const chrome = playingChrome()

  chrome.tap()
  vi.advanceTimersByTime(100)
  chrome.zoomed()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it('ignores a click that follows the zoom of a double-tap', () => {
  const chrome = playingChrome()

  chrome.tap()
  chrome.zoomed()
  chrome.tap()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it('takes a later tap normally after a double-tap', () => {
  const chrome = playingChrome()
  chrome.tap()
  chrome.zoomed()
  vi.advanceTimersByTime(300)

  chrome.tap()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(false)
})

it('does not reveal hidden controls for a pinch', () => {
  const chrome = playingChrome()
  vi.advanceTimersByTime(3000)

  chrome.zoomed()

  expect(chrome.visible).toBe(false)
})

it('reveals immediately on a tap while hidden', () => {
  const chrome = playingChrome()
  vi.advanceTimersByTime(3000)

  chrome.tap()

  expect(chrome.visible).toBe(true)
})

it('keeps a tap-hidden paused frame hidden', () => {
  const chrome = playingChrome()
  chrome.setPlaying(false)

  chrome.tap()
  vi.advanceTimersByTime(60_000)

  expect(chrome.visible).toBe(false)
})

it('does not bring hidden controls back when playback resumes', () => {
  const chrome = playingChrome()
  chrome.setPlaying(false)
  chrome.tap()
  vi.advanceTimersByTime(250)

  chrome.setPlaying(true)

  expect(chrome.visible).toBe(false)
})

it('never hides a photo on a timer, though a tap can', () => {
  const chrome = createMediaChrome()
  chrome.reset('manual')
  chrome.setPlaying(true)
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  chrome.tap()
  vi.advanceTimersByTime(250)
  expect(chrome.visible).toBe(false)
})

it('ignores taps while pinned', () => {
  const chrome = createMediaChrome()
  chrome.reset('pinned')

  chrome.tap()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it('resets to visible and drops a pending hide when the item changes', () => {
  const chrome = playingChrome()
  chrome.tap()

  chrome.reset('manual')
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it('holds the controls, and gives them 3 seconds after release', () => {
  const chrome = playingChrome()

  chrome.setHold('sheet', true)
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  chrome.setHold('sheet', false)
  vi.advanceTimersByTime(2999)
  expect(chrome.visible).toBe(true)
  vi.advanceTimersByTime(1)
  expect(chrome.visible).toBe(false)
})

it('stays held until every hold is released', () => {
  const chrome = playingChrome()
  chrome.setHold('sheet', true)
  chrome.setHold('stageSheet', true)

  chrome.setHold('sheet', false)
  vi.advanceTimersByTime(60_000)

  expect(chrome.visible).toBe(true)
})

it('reveals hidden controls when a hold starts', () => {
  const chrome = playingChrome()
  vi.advanceTimersByTime(3000)

  chrome.setHold('sheet', true)

  expect(chrome.visible).toBe(true)
})

it('stops its timers when destroyed', () => {
  const chrome = playingChrome()

  chrome.destroy()
  vi.advanceTimersByTime(60_000)

  expect(chrome.visible).toBe(true)
})

const surfaceOf = (chrome: ReturnType<typeof createMediaChrome>) => {
  const node = document.createElement('div')
  const button = node.appendChild(document.createElement('button'))
  document.body.append(node)
  onTestFinished(() => node.remove())
  return { button, node, teardown: chrome.surface(node) as () => void }
}

it('holds while a mouse is over a surface, not for touch', () => {
  const chrome = playingChrome()
  const { node } = surfaceOf(chrome)

  node.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }))
  vi.advanceTimersByTime(3000)
  expect(chrome.visible).toBe(false)

  node.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  node.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
  vi.advanceTimersByTime(3000)
  expect(chrome.visible).toBe(false)
})

it('holds through a press until its release, wherever that lands', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)

  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  window.dispatchEvent(new PointerEvent('pointerup'))
  vi.advanceTimersByTime(3000)
  expect(chrome.visible).toBe(false)
})

it('holds for keyboard focus only', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)
  const matches = vi.spyOn(button, 'matches')

  matches.mockReturnValue(false)
  button.focus()
  vi.advanceTimersByTime(3000)
  expect(chrome.visible).toBe(false)
  button.blur()

  matches.mockReturnValue(true)
  button.focus()
  expect(chrome.visible).toBe(true)
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  button.blur()
  vi.advanceTimersByTime(2999)
  expect(chrome.visible).toBe(true)
  vi.advanceTimersByTime(1)
  expect(chrome.visible).toBe(false)
})

// Paging unmounts the stage's footer while the reader is still on the toolbar or an arrow.
it('keeps keyboard focus on one surface held when another surface unmounts', () => {
  const chrome = playingChrome()
  const arrows = surfaceOf(chrome)
  const footer = surfaceOf(chrome)
  vi.spyOn(arrows.button, 'matches').mockReturnValue(true)
  arrows.button.focus()

  footer.teardown()
  vi.advanceTimersByTime(60_000)

  expect(chrome.visible).toBe(true)
})

it('keeps a mouse hover on one surface held when another surface unmounts', () => {
  const chrome = playingChrome()
  const arrows = surfaceOf(chrome)
  const footer = surfaceOf(chrome)
  arrows.node.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))

  footer.teardown()
  vi.advanceTimersByTime(60_000)

  expect(chrome.visible).toBe(true)
})

// Pausing removes a focused step button, and not every browser fires focusout for that.
it('lets go when the focused control is removed from the page', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)
  vi.spyOn(button, 'matches').mockReturnValue(true)
  button.focus()
  vi.advanceTimersByTime(60_000)
  expect(chrome.visible).toBe(true)

  button.remove()
  vi.advanceTimersByTime(3000)

  expect(chrome.visible).toBe(false)
})

// A key press flips an already focused control to :focus-visible, so focus is judged when it arrives.
it('does not hold for a mouse-focused control that matches focus-visible after a key press', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)
  const matches = vi.spyOn(button, 'matches').mockReturnValue(false)
  button.focus()

  matches.mockReturnValue(true)
  vi.advanceTimersByTime(3000)

  expect(chrome.visible).toBe(false)
})

// Otherwise Space would activate a button the reader cannot see.
it('takes focus off a control when the timer hides it', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)
  button.focus()

  vi.advanceTimersByTime(3000)

  expect(document.activeElement).not.toBe(button)
})

it('takes focus off a control when a tap hides it', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)
  button.focus()

  chrome.tap()
  vi.advanceTimersByTime(250)

  expect(document.activeElement).not.toBe(button)
})

it('leaves focus outside the controls alone when they hide', () => {
  const chrome = playingChrome()
  surfaceOf(chrome)
  const outside = document.body.appendChild(document.createElement('button'))
  onTestFinished(() => outside.remove())
  outside.focus()

  vi.advanceTimersByTime(3000)

  expect(document.activeElement).toBe(outside)
})

it('ignores a tap while a sheet is open', () => {
  const chrome = playingChrome()
  chrome.setHold('sheet', true)

  chrome.tap()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it('releases a press the browser cancels', () => {
  const chrome = playingChrome()
  const { button } = surfaceOf(chrome)

  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
  window.dispatchEvent(new PointerEvent('pointercancel'))
  vi.advanceTimersByTime(3000)

  expect(chrome.visible).toBe(false)
})

it.each([
  ['hover', (node: HTMLElement) => node.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))],
  ['press', (node: HTMLElement) => node.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }))],
  [
    'focus',
    (node: HTMLElement) => {
      const button = node.querySelector('button')!
      vi.spyOn(button, 'matches').mockReturnValue(true)
      button.focus()
    },
  ],
])('releases a %s hold when the surface unmounts', (_hold, start) => {
  const chrome = playingChrome()
  const { node, teardown } = surfaceOf(chrome)
  start(node)

  teardown()
  vi.advanceTimersByTime(3000)

  expect(chrome.visible).toBe(false)
})

it('stops a pending tap hide when destroyed', () => {
  const chrome = playingChrome()
  chrome.tap()

  chrome.destroy()
  vi.advanceTimersByTime(250)

  expect(chrome.visible).toBe(true)
})

it.each(['sheet', 'stageSheet'] as const)('reports a %s as an open sheet, for the key handlers', (hold) => {
  const chrome = createMediaChrome()
  expect(chrome.sheetOpen).toBe(false)

  chrome.setHold(hold, true)
  expect(chrome.sheetOpen).toBe(true)

  chrome.setHold(hold, false)
  expect(chrome.sheetOpen).toBe(false)
})

it('does not count a hover as an open sheet', () => {
  const chrome = createMediaChrome()
  const { node } = surfaceOf(chrome)

  node.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))

  expect(chrome.sheetOpen).toBe(false)
})
